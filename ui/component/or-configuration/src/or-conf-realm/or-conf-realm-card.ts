import { css, html, LitElement, unsafeCSS } from "lit";
import { InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";
import { customElement, property } from "lit/decorators.js";
import "@openremote/or-components/or-file-uploader";
import "@openremote/or-components/or-info";
import manager, {
  DEFAULT_LANGUAGES,
  DefaultColor1,
  DefaultColor2,
  DefaultColor3,
  DefaultColor4,
  DefaultColor5,
  DefaultColor6,
} from "@openremote/core";
import { i18next } from "@openremote/or-translate";
import { FileInfo, ManagerConfRealm, ManagerHeaders } from "@openremote/model";


@customElement("or-conf-realm-card")
export class OrConfRealmCard extends LitElement {

  static styles = css`
    .language {
      width: 100%;
      padding: 12px 0px;
      max-width: 800px;
    }

    .appTitle {
      width: 100%;
      max-width: 800px;
      padding: 12px 0px;
    }

    .header-group .header-item {
      width: 100%;
      padding: 12px 0px;
      max-width: 800px;
    }

    .color-group .color-item {
      width: 100%;
    }

    .logo-group {
      width: 100%;
    }

    .logo-group or-file-uploader {
      padding: 0 24px 12px 0;
    }

    #remove-realm {
      margin: 8px 4px;
    }

    .subheader {
      padding: 15px 0 4px 0;
      font-weight: bold;
    }

    .d-inline-flex {
      display: inline-flex;
    }

    .panel-content {
      padding: 0 36px;
    }

    .description {
      font-size: 12px;
    }

    or-collapsible-panel {
      margin: 8px;
    }
  `;

  @property({attribute: false})
  public realm: ManagerConfRealm = {
    appTitle: "OpenRemote Demo",
    language: "en",
    styles: "",
    headers: [],
  };

  @property({ attribute: true })
  public name: string = "";

  @property({ attribute: true })
  public onRemove: CallableFunction = () => {
  };

  protected headerListPrimary = [
    ManagerHeaders.map,
    ManagerHeaders.assets,
    ManagerHeaders.rules,
    ManagerHeaders.insights,
  ];


  protected headerListSecondary = [
    ManagerHeaders.gateway,
    ManagerHeaders.export,
    ManagerHeaders.logs,

    ManagerHeaders.users,
    ManagerHeaders.roles,
    ManagerHeaders.realms,

    ManagerHeaders.account,
    ManagerHeaders.language,

    ManagerHeaders.logout,

  ];

  protected _getColors() {
    //TODO settings default colors
    const colors: { [name: string]: string } = {
      "--or-app-color1": unsafeCSS(DefaultColor1).toString(),
      "--or-app-color2": unsafeCSS(DefaultColor2).toString(),
      '--or-app-color3': unsafeCSS(DefaultColor3).toString(),
      '--or-app-color4': unsafeCSS(DefaultColor4).toString(),
      '--or-app-color5': unsafeCSS(DefaultColor5).toString(),
      '--or-app-color6': unsafeCSS(DefaultColor6).toString(),
    }
    if (this.realm?.styles){
      //TODO use regex for filtering and getting color codes CSS
      const css = this.realm.styles.slice(this.realm.styles.indexOf("{") +1, this.realm.styles.indexOf("}"))
      css.split(";").forEach(function(value){
        const col = value.split(":")
        if (col.length >= 2){
          colors[col[0].trim()] = col[1].trim()
        }
      })
    }
    return colors
  }

  protected _setColor(key:string, value:string){
    const colors  = this._getColors()
    colors[key] = value
    let css = ":host > * {"
    Object.entries(colors).map(([key, value]) => {
      css += key +":" +value + ";"
    })
    this.realm.styles = css
  }

  protected _setHeader(keys:ManagerHeaders[], list: ManagerHeaders[]){
    if (!this.realm.headers){
      this.realm.headers = this.headerListSecondary.concat(this.headerListPrimary)
    }
    this.realm.headers = this.realm.headers?.filter(function(ele){
      return !list.includes(ele);
    });
    this.realm.headers = this.realm.headers?.concat(keys)
  }

  protected _getImagePath(file:File, fileName: string){
    let extension = "";
    switch (file.type){
      case "image/png":
        extension = "png"
        break;
      case "image/jpg":
        extension = "jpg"
        break;
      case "image/jpeg":
        extension = "jpeg"
        break;
      case "image/vnd.microsoft.icon":
        extension = "ico"
        break;
      case "image/svg+xml":
        extension = "svg"
        break;
    }
    return "/images/" + this.name + "/" + fileName + "." +  extension
  }

  protected files: {[name:string] : FileInfo} = {}

  protected async _setImageForUpload(file: File, fileName: string) {
    const path = this._getImagePath(file, fileName)
    this.files[path] = {
      // name: 'filename',
      contents: await this.convertBase64(file),
      // binary: true
    } as FileInfo;
    return path;
  }

  convertBase64 (file:any) {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsDataURL(file);

      fileReader.onload = () => {
        resolve(fileReader.result);
      };

      fileReader.onerror = (error) => {
        reject(error);
      };
    });
  };

  render() {
    const colors = this._getColors();
    const app = this;
    document.addEventListener('saveManagerConfig', () => {
      Object.entries(this.files).map(async ([x, y]) => {
        await manager.rest.api.ConfigurationResource.fileUpload(y, { path: x })
      })
    });

    return html`
      <or-collapsible-panel>
        <div slot="header" class="header-container">
          <strong>${this.name}</strong>
        </div>
        <div slot="content" class="panel-content">
          <div class="subheader">${i18next.t("configuration.main")}</div>
          <or-mwc-input class="appTitle" .type="${InputType.TEXT}" value="${this.realm?.appTitle}"
                        @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.realm.appTitle = e.detail.value}"
                        .label="${i18next.t("configuration.realmTitle")}"></or-mwc-input>
          <or-mwc-input class="language" .type="${InputType.SELECT}" value="${this.realm?.language}"
                        .options="${Object.entries(DEFAULT_LANGUAGES).map(([key, value]) => {
                          return [key, i18next.t(value)];
                        })}" @or-mwc-input-changed="${(e: OrInputChangedEvent) => this.realm.language = e.detail.value}"
                        .label="${i18next.t("configuration.defaultLanguage")}"></or-mwc-input>
          <div class="logo-group">
            <div class="subheader">${i18next.t("configuration.images")}</div>
            <div class="d-inline-flex">
              <or-file-uploader .title="${i18next.t('configuration.logo')}"
                                @change="${async (e: CustomEvent) => this.realm.logo = await this._setImageForUpload(e.detail.value[0], "logo")}"
                                .src="${this.realm?.logo}"></or-file-uploader>
              <or-file-uploader .title="${i18next.t('configuration.logoMobile')}"
                                @change="${async (e: CustomEvent) => this.realm.logoMobile = await this._setImageForUpload(e.detail.value[0], "logoMobile")}"
                                .src="${this.realm?.logoMobile}"></or-file-uploader>
              <or-file-uploader .title="${html`Favicon`}"
                                @change="${async (e: CustomEvent) => this.realm.favicon = await this._setImageForUpload(e.detail.value[0], "favicon")}"
                                .src="${this.realm?.favicon}"></or-file-uploader>
            </div>
          </div>
          <div class="color-group">
            <div class="subheader">${i18next.t('configuration.realmColors')}</div>
            <div>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color4"]}"
                            .label="${i18next.t('configuration.--or-app-color1')}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color4", e.detail.value)}"></or-mwc-input>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color5"]}"
                            .label="${i18next.t('configuration.--or-app-color2')}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color5", e.detail.value)}"></or-mwc-input>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color6"]}"
                            .label="${i18next.t("configuration.--or-app-color3")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color6", e.detail.value)}"></or-mwc-input>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color1"]}"
                            .label="${i18next.t("configuration.--or-app-color4")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color1", e.detail.value)}"></or-mwc-input>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color2"]}"
                            .label="${i18next.t("configuration.--or-app-color5")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color2", e.detail.value)}"></or-mwc-input>
              <or-mwc-input class="color-item" .type="${InputType.COLOUR}" value="${colors["--or-app-color3"]}"
                            .label="${i18next.t("configuration.--or-app-color6")}"
                            @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setColor("--or-app-color3", e.detail.value)}"></or-mwc-input>
            </div>
          </div>
          <div class="header-group">
            <div class="subheader">${i18next.t("configuration.navigation")}</div>
            <span>${i18next.t("configuration.navigationDescription")}</span>
            <div>
              <or-mwc-input
                .type="${InputType.SELECT}" multiple
                class="header-item"
                .label="${i18next.t("configuration.primaryNavigation")}"
                .value="${!!this.realm.headers ? this.realm.headers?.filter(function(ele) {
                  return app.headerListPrimary.includes(ele);
                }) : this.headerListPrimary}"
                .options="${this.headerListPrimary}"
                @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setHeader(e.detail.value, this.headerListPrimary)}"
              ></or-mwc-input>
              <or-mwc-input
                .type="${InputType.SELECT}" multiple
                class="header-item"
                .label="${i18next.t("configuration.secondaryNavigation")}"
                .value="${!!this.realm.headers ? this.realm.headers?.filter(function(ele) {
                  return app.headerListSecondary.includes(ele);
                }) : this.headerListSecondary}"
                .options="${this.headerListSecondary}"
                @or-mwc-input-changed="${(e: OrInputChangedEvent) => this._setHeader(e.detail.value, this.headerListSecondary)}"
              ></or-mwc-input>
            </div>
          </div>

          <or-mwc-input outlined id="remove-realm" .type="${InputType.BUTTON}" .label="${i18next.t("delete")}"
                        @click="${() => {
                          this.onRemove();
                        }}"></or-mwc-input>
        </div>
      </or-collapsible-panel>
    `;
  }
}