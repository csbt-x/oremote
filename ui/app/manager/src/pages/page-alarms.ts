
import { css, html, TemplateResult, PropertyValues, unsafeCSS } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@openremote/or-alarm-viewer";
import { OrAlarmTableRowClickEvent, ViewerConfig } from "@openremote/or-alarm-viewer";
import { Page, PageProvider, router, AppStateKeyed } from "@openremote/or-app";
import { Store } from "@reduxjs/toolkit";
import {
  AlarmAssetLink,
  AlarmUserLink,
  SentAlarm,
  ClientRole,
  UserQuery,
  AlarmStatus,
  AlarmSeverity,
} from "@openremote/model";
import manager, { DefaultColor3, DefaultColor4 } from "@openremote/core";
import i18next from "i18next";
import { Asset, User } from "@openremote/model";
import { showSnackbar } from "@openremote/or-mwc-components/or-mwc-snackbar";
import { GenericAxiosResponse, isAxiosError } from "@openremote/rest";
import { getAlarmsRoute } from "../routes";
import { when } from "lit/directives/when.js";
import { until } from "lit/directives/until.js";
import { InputType, OrInputChangedEvent, OrMwcInput } from "@openremote/or-mwc-components/or-mwc-input";
import { OrMwcDialog, showOkCancelDialog, showDialog } from "@openremote/or-mwc-components/or-mwc-dialog";
import { OrAssetTreeRequestSelectionEvent } from "@openremote/or-asset-tree";

export interface PageAlarmsConfig {
  viewer?: ViewerConfig;
}

export function pageAlarmsProvider(store: Store<AppStateKeyed>, config?: PageAlarmsConfig): PageProvider<AppStateKeyed> {
  return {
    name: "alarms",
    routes: ["alarms", "alarms/:id"],
    pageCreator: () => {
      const page = new PageAlarms(store);
      if(config) page.config = config;
      return page;
  }
  };
}

interface AlarmModel extends SentAlarm {
  loaded?: boolean;
  loading?: boolean;
  alarmAssetLinks?: AlarmAssetLink[];
  alarmUserLinks?: AlarmUserLink[];
}

@customElement("page-alarms")
export class PageAlarms extends Page<AppStateKeyed> {
  static get styles() {
    // language=CSS
    return css`
      :host {
        flex: 1;
        width: 100%;
      }

      or-alarm-viewer {
        width: 100%;
      }

      #wrapper {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        overflow: auto;
      }

      #title {
        padding: 0;
        font-size: 18px;
        font-weight: bold;
        width: 100%;
        margin: 10px 10px 0 0;
        display: flex;
        color: var(--or-app-color3, ${unsafeCSS(DefaultColor3)});
      }

      #title or-icon {
        margin-right: 10px;
        margin-left: 14px;
      }

      .panel {
        width: calc(100% - 100px);
        max-width: 1000px;
        background-color: white;
        border: 1px solid #e5e5e5;
        border-radius: 5px;
        position: relative;
        margin: auto;
        padding: 12px 24px 24px;
      }

      .panel-title {
        text-transform: uppercase;
        font-weight: bolder;
        color: var(--or-app-color3, ${unsafeCSS(DefaultColor3)});
        line-height: 1em;
        margin-bottom: 10px;
        margin-top: 0;
        flex: 0 0 auto;
        letter-spacing: 0.025em;
        display: flex;
        align-items: center;
        min-height: 36px;
      }

      or-mwc-input {
        margin-bottom: 20px;
      }

      or-icon {
        vertical-align: middle;
        --or-icon-width: 20px;
        --or-icon-height: 20px;
        margin-right: 2px;
        margin-left: -5px;
      }

      .row {
        display: flex;
        flex-direction: row;
        margin: auto;
        flex: 1 1 0;
        gap: 24px;
      }

      .column {
        display: flex;
        flex-direction: column;
        margin: 0px;
        flex: 1 1 0;
      }

      .hidden {
        display: none;
      }

      .breadcrumb-container {
        padding: 0 20px;
        width: calc(100% - 40px);
        max-width: 1360px;
        margin-top: 10px;
        display: flex;
        align-items: center;
      }

      .breadcrumb-clickable {
        cursor: pointer;
        color: ${unsafeCSS(DefaultColor4)};
      }

      .breadcrumb-arrow {
        margin: 0 5px -3px 5px;
        --or-icon-width: 16px;
        --or-icon-height: 16px;
      }
    `;
  }

  @property()
  public config?: PageAlarmsConfig;

  @property()
  public realm?: string;
  @state()
  public alarm?: AlarmModel;
  @state()
  public creationState?: {
    alarmModel: AlarmModel;
  };

  @state()
  protected _alarms: AlarmModel[] = [];
  @state()
  protected _linkedAssets: Asset[] = [];
  @state()
  protected _linkedUsers: User[] = [];
  @state()
  protected _loadedUsers: User[] = [];

  protected _loading: boolean = false;
  protected _assign: boolean = false;
  protected _userId?: string;

  @state()
  protected _loadAlarmsPromise?: Promise<any>;

  @state()
  protected _saveAlarmPromise?: Promise<any>;

  @state()
  protected _loadUsersPromise?: Promise<any>;

  get name(): string {
    return "alarm.alarm_plural";
  }

  constructor(store: Store<AppStateKeyed>) {
    super(store);
  }

  public connectedCallback() {
    super.connectedCallback();
  }

  public disconnectedCallback() {
    this.reset();
    super.disconnectedCallback();
  }

  public shouldUpdate(changedProperties: PropertyValues): boolean {
    if (changedProperties.has("realm") && changedProperties.get("realm") != undefined) {
      this.reset();
    }
    if (changedProperties.has("alarm")) {
      this._updateRoute();
    }
    return super.shouldUpdate(changedProperties);
  }

  protected responseAndStateOK(
    stateChecker: () => boolean,
    response: GenericAxiosResponse<any>,
    errorMsg: string
  ): boolean {
    if (!stateChecker()) {
      return false;
    }

    if (!response.data) {
      showSnackbar(undefined, errorMsg, i18next.t("dismiss"));
      console.error(errorMsg + ": response = " + response.statusText);
      return false;
    }

    return true;
  }

  protected async _createUpdateAlarm(alarm: AlarmModel, action: "update" | "create") {
    if (!alarm.title || !alarm.content) {
      return;
    }

    if (alarm.content === "" || alarm.title === "") {
      // Means a validation failure shouldn't get here
      return;
    }

    const isUpdate = !!alarm.id;
    if (!isUpdate) {
      alarm.realm = manager.getRealm();
    }

    try {
      action == "update"
        ? await manager.rest.api.AlarmResource.updateAlarm(alarm.id, alarm)
        : await manager.rest.api.AlarmResource.createAlarm(alarm);
    } catch (e) {
      if (isAxiosError(e)) {
        console.error(
          (isUpdate ? "save alarm failed" : "create alarm failed") + ": response = " + e.response.statusText
        );

        if (e.response.status === 400) {
          showSnackbar(
            undefined,
            i18next.t(isUpdate ? "alarm.saveAlarmFailed" : "alarm.createAlarmFailed"),
            i18next.t("dismiss")
          );
        } else if (e.response.status === 403) {
          showSnackbar(undefined, i18next.t("alarm.alarmAlreadyExists"));
        }
      }
      throw e; // Throw exception anyhow to handle individual cases
    } finally {
      this.reset();
    }
  }

  protected render() {
    if (!manager.authenticated) {
      return html` <or-translate value="notAuthenticated"></or-translate> `;
    }

    const readAlarms = manager.hasRole("read:alarms");
    const writeAlarms = manager.hasRole("write:alarms");
    
    const readonly = readAlarms && !writeAlarms;
    const assignOnly = !readAlarms && !writeAlarms;
    this.config = { viewer: {assignOnly: assignOnly }};
    return html`
      <div id="wrapper">
        <!-- Alarm Specific page -->
        ${when(this.alarm || this.creationState, () =>
            html`
              <!-- Breadcrumb on top of the page-->
              <div class="breadcrumb-container">
                <span class="breadcrumb-clickable" @click="${() => this.reset()}"
                  >${i18next.t("alarm.alarm_plural")}</span
                >
                <or-icon class="breadcrumb-arrow" icon="chevron-right"></or-icon>
                <span style="margin-left: 2px;"
                  >${this.alarm != undefined ? this.alarm.title : i18next.t("alarm.creatingAlarm")}</span
                >
              </div>  
        `)}

        <div id="title" style="justify-content: space-between;">
          <div>
            <or-icon icon="alert-outline"></or-icon>
            <span> ${this.alarm != undefined ? this.alarm.title : i18next.t("alarm.alarm_plural")} </span>
          </div>

          <div class="${this.creationState || this.alarm ? "hidden" : "panel-title"} style="justify-content: flex-end;">
          <or-mwc-input
            style="margin: 0;"
            type="${InputType.BUTTON}"
            icon="plus"
            label="${i18next.t("add")} ${i18next.t("alarm.")}"
            @or-mwc-input-changed="${() => (this.creationState = { alarmModel: this.getNewAlarmModel() })}"
          ></or-mwc-input>
          </div>
        </div>
        ${when(this.alarm || this.creationState, () => {
          const alarm: AlarmModel = this.alarm != undefined ? this.alarm : this.creationState.alarmModel;
          return html`
            <div id="content" class="panel">
              <p class="panel-title">${i18next.t("alarm.")} ${i18next.t("settings")}</p>
              ${this.getSingleAlarmView(alarm, readonly)}
            </div>
          </div> `;
        }, () =>
          html`
          <!-- List of Alarms page -->
            <or-alarm-viewer
              .config="${this.config?.viewer}"
              @or-alarm-table-row-click="${this._onRowClick}"
            ></or-alarm-viewer> `
        )}
    `;
  }

  protected getNewAlarmModel(): AlarmModel {
    return {
      alarmAssetLinks: [],
      alarmUserLinks: [],
      loaded: true,
    };
  }

  protected async loadAlarm(alarm: AlarmModel) {
    if (alarm.loaded) {
      return;
    }
    const stateChecker = () => {
      return this.getState().app.realm === this.realm && this.isConnected;
    };

    const alarmAssetLinksResponse = await manager.rest.api.AlarmResource.getAssetLinks(alarm.id, alarm.realm);
    if (!this.responseAndStateOK(stateChecker, alarmAssetLinksResponse, i18next.t("loadFailedUsers"))) {
      console.log("Failed to load alarm asset links");
      return;
    }

    if(manager.hasRole("read:admin")) {
      const usersResponse = await manager.rest.api.UserResource.query({
        realmPredicate: { name: manager.displayRealm },
      } as UserQuery);

      if (!this.responseAndStateOK(stateChecker, usersResponse, i18next.t("loadFailedUsers"))) {
        return;
      }
    
      this._loadedUsers = usersResponse.data.filter((user) => user.enabled && !user.serviceAccount);
    }
    this.alarm.alarmAssetLinks = alarmAssetLinksResponse.data;
    this.alarm.loaded = true;
    this.alarm.loading = false;

    // Update the dom
    this.requestUpdate();
  }

  protected getSingleAlarmView(alarm: AlarmModel, readonly: boolean = true): TemplateResult {
    return html`
      ${when(
      alarm.loaded,
      () => {
        return this.getSingleAlarmTemplate(alarm, readonly);
      },
      () => {
        const getTemplate = async () => {
          await this.loadAlarm(alarm);
          return this.getSingleAlarmTemplate(alarm, readonly);
        };
        const content: Promise<TemplateResult> = getTemplate();
        return html` ${until(content, html`${i18next.t("loading")}`)} `;
      }
    )}
    `;
  }

  protected getSingleAlarmTemplate(alarm: AlarmModel, readonly: boolean = true): TemplateResult {
    return html`
    <div class="row">
      <div class="column">
      <or-mwc-input ?readonly="${true}"
                                  .label="${i18next.t("createdOn")}"
                                  .type="${InputType.DATETIME}" 
                                  .value="${new Date(alarm.createdOn)}"
                                  }}"></or-mwc-input>
                                  </div>
                                  <div class="column">
                                  <or-mwc-input ?readonly="${true}"
                                  .label="${i18next.t("alarm.lastModified")}"
                                  .type="${InputType.DATETIME}" 
                                  .value="${new Date(alarm.lastModified)}"
                                  }}"></or-mwc-input>
                                  </div>
                                  </div>
            <div class="row">
                <div class="column">
                    <h5>${i18next.t("details")}</h5>
                    <!-- alarm details -->
                    <or-mwc-input ?readonly="${readonly}"
                                  .label="${i18next.t("alarm.title")}"
                                  .type="${InputType.TEXT}" 
                                  .value="${alarm.title}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
        alarm.title = e.detail.value;
        this.onAlarmChanged(e);
      }}"></or-mwc-input>
                    <or-mwc-input ?readonly="${readonly}"
                                  .label="${i18next.t("alarm.content")}"
                                  .type="${InputType.TEXTAREA}" 
                                  .value="${alarm.content}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
        alarm.content = e.detail.value;
        this.onAlarmChanged(e);
      }}"></or-mwc-input>
                </div>
                <div class="column">
                    <h5>${i18next.t("properties")}</h5>
                    <or-mwc-input ?readonly="${readonly}"
                                  .label="${i18next.t("alarm.severity")}"
                                  .type="${InputType.SELECT}"
                                  .options="${[AlarmSeverity.LOW, AlarmSeverity.MEDIUM, AlarmSeverity.HIGH]}"
                                  .value="${alarm.severity}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
        alarm.severity = e.detail.value;
        this.onAlarmChanged(e);
      }}"></or-mwc-input>
                    <or-mwc-input ?readonly="${readonly}"
                                  .label="${i18next.t("alarm.status")}"
                                  .type="${InputType.SELECT}"
                                  .options="${[
        AlarmStatus.ACTIVE,
        AlarmStatus.ACKNOWLEDGED,
        AlarmStatus.INACTIVE,
        AlarmStatus.RESOLVED,
      ]}"
                                  .value="${alarm.status}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
        alarm.status = e.detail.value;
        this.onAlarmChanged(e);
      }}"></or-mwc-input>
                                  
                                  
                     <or-mwc-input ?readonly="${!manager.hasRole("read:admin")}"
                                  class="${this.creationState || readonly ? "hidden" : ""}"
                                  .label="${i18next.t("alarm.assignee")}"
                                  .type="${InputType.SELECT}"
                                  .options="${this._getUsers().map((obj) => obj.label)}"
                                  .value="${alarm.assigneeUsername}"
                                  @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
                                    console.log("Assignee changed: ", e.detail.value);
        alarm.assigneeId = this._getUsers().filter((obj) => obj.label === e.detail.value).map((obj) => obj.value)[0];
        this.onAlarmChanged(e);
      }}"></or-mwc-input> 

                    <div class="${this.creationState ? "hidden" : ""}">
                        <span style="margin: 0px auto 10px;">${i18next.t("linkedAssets")}:</span>
                        <or-mwc-input outlined ?disabled="${readonly}" style="margin-left: 4px;"
                                      .type="${InputType.BUTTON}"
                                      .label="${i18next.t("selectRestrictedAssets", {
        number: alarm.alarmAssetLinks?.length,
      })}"
                                      @or-mwc-input-changed="${(ev: MouseEvent) =>
        this._openAssetSelector(ev, alarm, readonly)}"></or-mwc-input>
                    </div>
                </div>
            </div>

                <!-- Bottom controls (save/update and delete button) -->
                ${when(
          !(readonly && !this._saveAlarmPromise),
          () => html`
                    <div class="row" style="margin-bottom: 0; justify-content: space-between;">
                      <div style="display: flex; align-items: center; gap: 16px; margin: 0 0 0 auto;">
                        <or-mwc-input
                          id="savebtn"
                          style="margin: 0;"
                          raised
                          ?disabled="${readonly}"
                          .label="${i18next.t(alarm.id ? "save" : "create")}"
                          .type="${InputType.BUTTON}"
                          @or-mwc-input-changed="${(e: OrInputChangedEvent) => {
              let error: { status?: number; text: string };
              this._saveAlarmPromise = this._createUpdateAlarm(alarm, alarm.id ? "update" : "create")
                .then(() => {
                  showSnackbar(undefined, i18next.t("alarm.saveAlarmSucceeded"));
                  this.reset();
                })
                .catch((ex) => {
                  if (isAxiosError(ex)) {
                    error = {
                      status: ex.response.status,
                      text:
                        ex.response.status == 403
                          ? i18next.t("alarm.alarmAlreadyExists")
                          : i18next.t("errorOccurred"),
                    };
                  }
                })
                .finally(() => {
                  this._saveAlarmPromise = undefined;
                });
            }}"
                        >
                        </or-mwc-input>
                      </div>
                    </div>
                  `
        )}
        `;
  }

  protected _onRowClick(ev: OrAlarmTableRowClickEvent) {
    if (!ev.detail.alarm) {
      return;
    }
    this.alarm = ev.detail.alarm as AlarmModel;
    this.alarm.loaded = false;
    this.alarm.loading = false;
    this.alarm.alarmAssetLinks = [];
    this.alarm.alarmUserLinks = [];
    console.log("alarm", this.alarm);
    this.loadAlarm(this.alarm);
    this.requestUpdate();
  }

  protected _onAddClick() {
    this.creationState = { alarmModel: this.getNewAlarmModel() };
    this.requestUpdate();
  }

  protected _getUsers() {
    return this._loadedUsers.map((u) => {
      return { value: u.id, label: u.username };
    });
  }

  protected _assignClick() {
    this._assign = !this._assign;
    this.requestUpdate();
  }

  protected async _assignUser(alarm: AlarmModel) {
    if (!this._userId || !this.alarm.id) {
      return;
    }
    try {
      await manager.rest.api.AlarmResource.assignUser(alarm.id, this._userId);
    } catch (e) {
      if (isAxiosError(e)) {
        console.error("save alarm failed" + ": response = " + e.response.statusText);

        if (e.response.status === 400) {
          showSnackbar(undefined, i18next.t("alarm.saveAlarmFailed"), i18next.t("dismiss"));
        }
      }
      throw e; // Throw exception anyhow to handle individual cases
    } finally {
      await this.loadAlarm(alarm);
    }
  }

  protected _openAssetSelector(ev: MouseEvent, alarm: AlarmModel, readonly: boolean) {
    const openBtn = ev.target as OrMwcInput;
    openBtn.disabled = true;

    const dialog = showDialog(
      new OrMwcDialog()
        .setHeading(i18next.t("linkedAssets"))
        .setContent(
          html`
            <or-asset-tree
              id="chart-asset-tree"
              readonly="true"
              .selectedIds="${alarm.alarmAssetLinks?.map((al) => al.id.assetId)}"
              .showSortBtn="${false}"
              expandNodes
              checkboxes
              @or-asset-tree-request-selection="${(e: OrAssetTreeRequestSelectionEvent) => {
              e.detail.allow = false;
            }}"
            ></or-asset-tree>
          `
        )
        .setActions([
          {
            default: true,
            actionName: "cancel",
            content: i18next.t("cancel"),
            action: () => {
              openBtn.disabled = false;
            },
          },
        ])
        .setDismissAction({
          actionName: "cancel",
          action: () => {
            openBtn.disabled = false;
          },
        })
    );
  }

  // Reset selected alarm and go back to the alarm overview
  protected reset() {
    this.alarm = undefined;
    this.creationState = undefined;
    this._assign = false;
  }

  public stateChanged(state: AppStateKeyed) {
    if (state.app.page == "alarms") {
      this.realm = state.app.realm;
      //this.alarm.id = state.app.params && state.app.params.id ? state.app.params.id : undefined;
    }
  }

  protected _updateRoute(silent: boolean = false) {
    router.navigate(getAlarmsRoute(this.alarm?.id.toString()), {
      callHooks: !silent,
      callHandler: !silent,
    });
  }

  protected onAlarmChanged(e: OrInputChangedEvent | OrMwcInput) {
    // Don't have form-associated custom element support in lit at time of writing which would be the way to go here
    const formElement = e instanceof OrInputChangedEvent ? (e.target as HTMLElement).parentElement : e.parentElement;
    const saveBtn = this.shadowRoot.getElementById("savebtn") as OrMwcInput;

    if (formElement) {
      const saveDisabled = Array.from(formElement.children)
        .filter((e) => e instanceof OrMwcInput)
        .some((input) => !(input as OrMwcInput).valid);
      saveBtn.disabled = saveDisabled;
    }
  }
}
