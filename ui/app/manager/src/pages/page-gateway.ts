import {css, html, PropertyValues, TemplateResult, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {until} from "lit/directives/until.js";
import i18next from "i18next";
import "@openremote/or-components/or-panel";
import {ClientRole, ConnectionStatus, GatewayConnection, GatewayConnectionStatusEvent} from "@openremote/model";
import manager, {DefaultColor1, DefaultColor3} from "@openremote/core";
import {InputType, OrInputChangedEvent} from "@openremote/or-mwc-components/or-mwc-input";
import {AppStateKeyed, Page, PageProvider} from "@openremote/or-app";
import {Store} from "@reduxjs/toolkit";

export function pageGatewayProvider(store: Store<AppStateKeyed>): PageProvider<AppStateKeyed> {
    return {
        name: "gateway",
        routes: [
            "gateway"
        ],
        pageCreator: () => {
            return new PageGateway(store);
        }
    };
}

@customElement("page-gateway")
export class PageGateway extends Page<AppStateKeyed>  {

    static get styles() {
        // language=CSS
        return css`
            :host {
                flex: 1;
                width: 100%;
                
                display: flex;
                justify-content: center;
                
                --or-panel-heading-min-height: 0px;
                --or-panel-heading-margin: 4px 0 0 10px;
                --or-panel-background-color: var(--or-app-color1, ${unsafeCSS(DefaultColor1)});
                --or-panel-heading-font-size: 14px; 
                --or-panel-padding: 14px;
            }            
            
            #wrapper {  
                height: 100%;
                width: 100%;
                display: flex;
                flex-direction: column;
                overflow: auto;
            }
                
            #title {
                margin: 20px auto 0;
                font-size: 18px;
                font-weight: bold;
                max-width: 1360px;
                width: 100%;
                color: var(--or-app-color3, ${unsafeCSS(DefaultColor3)});
            }

            #title > or-icon {
                margin-right: 10px;
                margin-left: 14px;
            }
            
            or-panel {
                position: relative;
                max-width: 1360px;
                width: 100%;
                margin: 20px auto;
            }
            
            #gateway-status-header {
                position: absolute;
                top: 15px;
                right: 25px;
                font-weight: bold;  
            }
            
            #gateway-content {
                display: flex;
                flex-wrap: wrap;
                padding: 10px;
                gap: 40px;
            }
            
            .gateway-column {
                flex: 1;
                flex-basis: 45%;
                min-width: 350px;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            
            .gateway-sharing-control {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .gateway-sharing-control-child {
                margin-left: 20px;
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            #gateway-footer {
                margin-top: 40px;
                display: flex;
                justify-content: space-between;
            }
            
            #gateway-footer > div {
                display: flex;
                gap: 10px;
            }

            @media only screen and (max-width: 780px){
                :host { 
                    --or-panel-border-radius: 0;
                }
                or-panel {
                    width: 100%;
                    min-width: auto;
                }

                #title {
                    width: 100%;
                    min-width: auto;
                }
            }
            
            @media only screen and (max-width: 1200px) {
                #gateway-content {
                    gap: 20px;
                }
            }
        `;
    }

    @state()
    protected realm?: string;

    @state()
    protected _loading = true;

    @state()
    protected _connection?: GatewayConnection;

    @state()
    protected _connectionStatus?: ConnectionStatus;

    @property()
    protected _dirty = false;

    protected _readonly = false;
    protected _eventSubscriptionId?: string;

    get name(): string {
        return "gatewayConnection";
    }

    constructor(store: Store<AppStateKeyed>) {
        super(store);
    }

    connectedCallback() {
        super.connectedCallback();
        this._readonly = !manager.hasRole(ClientRole.WRITE_ADMIN);
        this._subscribeEvents();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this._unsubscribeEvents();
    }

    public shouldUpdate(_changedProperties: PropertyValues): boolean {

        if (_changedProperties.has("realm")) {
            this._loadData();
        }

        return super.shouldUpdate(_changedProperties);
    }

    public updated(_changedProperties: PropertyValues): void {
        super.updated(_changedProperties);

        if (!this.realm) {
            this.realm = manager.displayRealm;
        }
    }

    protected render(): TemplateResult | void {
        const disabled = this._loading || this._readonly;

        return html`
            <div id="wrapper">
                <div id="title">
                    <or-icon icon="cloud"></or-icon>${i18next.t("gatewayConnection")}
                </div>
                <or-panel ?disabled="${this._loading}" .heading="${i18next.t("connectionDetails")}">
                    
                    ${until(this.getHeaderTemplate(this._connectionStatus, disabled))}

                    ${until(this.getContentTemplate(this._connection, disabled))}
                    
                    ${until(this.getFooterTemplate(disabled, this._dirty))}
                </or-panel>
            </div>
        `;
    }

    protected async getHeaderTemplate(connectionStatus: ConnectionStatus, _disabled = true): Promise<TemplateResult> {
        return html`
            <div id="gateway-status-header">
                ${connectionStatus}
                <or-mwc-input .type="${InputType.BUTTON}" label="JSON" outlined icon="pencil"></or-mwc-input>
            </div>
        `;
    }

    protected async getContentTemplate(connection: GatewayConnection, disabled = true): Promise<TemplateResult> {
        return html`
            <div id="gateway-content">
                ${until(this.getSettingsColumns(connection, disabled), html`<or-loading></or-loading>`)}
                ${until(this.getSharingColumns(connection, disabled), html`<or-loading></or-loading>`)}
            </div>
        `;
    }

    protected async getSettingsColumns(connection: GatewayConnection, disabled = true): Promise<TemplateResult> {
        return html`
            <div id="gateway-column-1" class="gateway-column">
                <h5 style="margin-bottom: 0">
                    <or-translate value="settings"></or-translate>
                </h5>
                <or-mwc-input .label="${i18next.t("host")}" .type="${InputType.TEXT}" ?disabled="${disabled}" .value="${connection?.host}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("host", e.detail.value)}"
                ></or-mwc-input>
                <or-mwc-input .label="${i18next.t("port")}" .type="${InputType.NUMBER}" ?disabled="${disabled}" min="1" max="65536" step="1" .value="${connection?.port}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("port", e.detail.value)}"
                ></or-mwc-input>
                <or-mwc-input .label="${i18next.t("realm")}" .type="${InputType.TEXT}" ?disabled="${disabled}" .value="${connection?.realm}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("realm", e.detail.value)}"
                ></or-mwc-input>
                <or-mwc-input .label="${i18next.t("disabled")}" .type="${InputType.CHECKBOX}" ?disabled="${disabled}" .value="${connection?.disabled || false}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("disabled", e.detail.value)}"
                ></or-mwc-input>
            </div>

            <div id="gateway-column-2" class="gateway-column">
                <h5 style="margin-bottom: 0">
                    <or-translate value=""></or-translate>
                </h5>
                <or-mwc-input .label="${i18next.t("clientId")}" .type="${InputType.TEXT}" ?disabled="${disabled}" .value="${connection?.clientId}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("clientId", e.detail.value)}"
                ></or-mwc-input>
                <or-mwc-input .label="${i18next.t("clientSecret")}" .type="${InputType.TEXT}" ?disabled="${disabled}" .value="${connection?.clientSecret}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("clientSecret", e.detail.value)}"
                ></or-mwc-input>
                <or-mwc-input .label="${i18next.t("secured")}" .type="${InputType.CHECKBOX}" style="height: 56px;" ?disabled="${disabled}" .value="${connection?.secured || false}"
                              @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setConnectionProperty("secured", e.detail.value)}"
                ></or-mwc-input>
            </div>
        `;
    }

    protected async getSharingColumns(_connection: GatewayConnection, disabled = true): Promise<TemplateResult> {
        return html`
            <div id="gateway-column-3" class="gateway-column">
                <h5 style="margin-bottom: 0">
                    <or-translate value="details"></or-translate>
                </h5>
                <div class="gateway-sharing-control">
                    <or-mwc-input .label="${i18next.t("gateway.limit_sharing_attribute")}" .type="${InputType.CHECKBOX}" ?disabled="${disabled}"></or-mwc-input>
                    <div class="gateway-sharing-control-child">
                        <or-mwc-input label="X asset types selected" .type="${InputType.BUTTON}" raised ?disabled="${disabled}"></or-mwc-input>
                    </div>
                </div>
                <div class="gateway-sharing-control">
                    <or-mwc-input .label="${i18next.t("gateway.limit_sharing_rate")}" .type="${InputType.CHECKBOX}" ?disabled="${disabled}"></or-mwc-input>
                    <div class="gateway-sharing-control-child">
                        <or-mwc-input .type="${InputType.NUMBER}" compact outlined style="width: 84px;"></or-mwc-input>
                        <span>minutes interval .............</span>
                    </div>
                </div>
            </div>
        `;
    }

    protected async getFooterTemplate(disabled = true, changed = false): Promise<TemplateResult> {
        return html`
            <div id="gateway-footer">
                <div id="gateway-footer-start">
                    <or-mwc-input label="delete" ?disabled="${disabled}" .type="${InputType.BUTTON}" outlined @click="${() => this._delete()}"></or-mwc-input>
                    <or-mwc-input label="reset" ?disabled="${!changed || disabled}" .type="${InputType.BUTTON}" outlined @click="${() => this._reset()}"></or-mwc-input>
                </div>
                <div id="gateway-footer-end">
                    <or-mwc-input label="save" ?disabled="${!changed || disabled}" .type="${InputType.BUTTON}" raised @click="${() => this._save()}"></or-mwc-input>
                </div>
            </div>
        `;
    }

    public stateChanged(state: AppStateKeyed) {
        this.realm = state.app.realm;
    }

    protected async _subscribeEvents() {
        if (manager.events) {
            this._eventSubscriptionId = await manager.events.subscribe<GatewayConnectionStatusEvent>({
                eventType: "gateway-connection-status"
            }, (ev) => this._onEvent(ev));
        }
    }

    protected _unsubscribeEvents() {
        if (this._eventSubscriptionId) {
            manager.events!.unsubscribe(this._eventSubscriptionId);
            this._eventSubscriptionId = undefined;
        }
    }

    protected async _loadData() {
        this._loading = true;
        this._connection = {secured: true};
        this._connectionStatus = null;
        const connectionResponse = await manager.rest.api.GatewayClientResource.getConnection(this.realm);
        const statusResponse = await manager.rest.api.GatewayClientResource.getConnectionStatus(this.realm);

        this._setConnection(connectionResponse.data);
        this._connectionStatus = statusResponse.data;
    }

    protected _setConnectionProperty(propName: string, value: any) {
        this._connection[propName] = value;
        this._dirty = true;
    }

    protected _reset() {
        this._loadData();
    }

    protected async _delete() {
        this._loading = true;
        const response = await manager.rest.api.GatewayClientResource.deleteConnection(this.realm);
        if (response.status !== 204) {
            // TODO: Toast message
        }
        this._loadData();
    }

    protected async _save() {
        this._loading = true;
        const response = await manager.rest.api.GatewayClientResource.setConnection(this.realm, this._connection);
        if (response.status !== 204) {
            // TODO: Toast message
        }
        this._loadData();
    }

    protected _setConnection(connection: GatewayConnection) {
        this._connection = connection || {secured: true};
        this._loading = false;
        this._dirty = false;
    }

    protected _onEvent(event: GatewayConnectionStatusEvent) {
        if (event.realm === this.realm) {
            this._connectionStatus = event.connectionStatus;
        }
    }
}
