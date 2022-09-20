import {css, html, LitElement} from "lit";
import { customElement, property} from "lit/decorators.js";
import {InputType} from '@openremote/or-mwc-components/or-mwc-input';
import "@openremote/or-icon";
import {style} from "./style";
import {Dashboard, DashboardScalingPreset, DashboardScreenPreset} from "@openremote/model";
import manager from "@openremote/core";
import {ListItem} from "@openremote/or-mwc-components/or-mwc-list";
import "@openremote/or-mwc-components/or-mwc-menu";
import { getContentWithMenuTemplate } from "@openremote/or-mwc-components/or-mwc-menu";
import {showOkCancelDialog} from "@openremote/or-mwc-components/or-mwc-dialog";
import { i18next } from "@openremote/or-translate";
import {showSnackbar} from "@openremote/or-mwc-components/or-mwc-snackbar";
import {style as OrAssetTreeStyle} from "@openremote/or-asset-tree";

//language=css
const treeStyling = css`
    #header-btns {
        display: flex;
        flex-direction: row;
        padding-right: 5px;
    }
    .node-container {
        align-items: center;
        padding-left: 10px;
    }
`;

enum DashboardSizeOption {
    LARGE, MEDIUM, SMALL, FULLSCREEN, CUSTOM
}

@customElement("or-dashboard-tree")
export class OrDashboardTree extends LitElement {

    static get styles() {
        return [style, treeStyling, OrAssetTreeStyle];
    }

    @property()
    protected realm?: string;

    @property()
    private dashboards: Dashboard[] | undefined;

    @property({hasChanged: (oldVal, val): boolean => {
        return JSON.stringify(oldVal) != JSON.stringify(val);
    }})
    private selected: Dashboard | undefined;

    @property() // REQUIRED
    private readonly userId?: string;

    @property()
    protected hasChanged: boolean = false;

    @property()
    protected showControls: boolean = true;


    /* --------------- */

    constructor() {
        super();
        this.updateComplete.then(async () => {
            if(this.dashboards == undefined) {
                await this.getAllDashboards();
            }
        });
    }

    private async getAllDashboards() {
        return manager.rest.api.DashboardResource.getAllRealmDashboards(this.realm!)
            .then((result) => {
                this.dashboards = result.data;
            }).catch((reason) => {
                console.error(reason);
                showSnackbar(undefined, i18next.t('errorOccurred'));
            });
    }

    updated(changedProperties: Map<string, any>) {
        console.log(changedProperties);
        if(this.realm == undefined) { this.realm = manager.displayRealm; }

        if(changedProperties.has("dashboards") && changedProperties.get("dashboards") != null) {
            this.dispatchEvent(new CustomEvent("updated", { detail: this.dashboards }));
        }
        if(changedProperties.has("selected")) {
            this.dispatchEvent(new CustomEvent("select", { detail: this.selected }));
        }
    }


    /* ---------------------- */

    private createDashboard(size: DashboardSizeOption) {
        const randomId = (Math.random() + 1).toString(36).substring(2);
        const dashboard = {
            realm: this.realm!,
            displayName: i18next.t('dashboard.initialName'),
            template: {
                id: randomId,
                columns: this.getDefaultColumns(size),
                maxScreenWidth: 4000,
                screenPresets: this.getDefaultScreenPresets(size),
            }
        } as Dashboard
        manager.rest.api.DashboardResource.create(dashboard).then((response => {
            if(response.status == 200) {
                this.dashboards?.push(response.data);
                this.requestUpdate("dashboards");
                this.dispatchEvent(new CustomEvent("created", { detail: { dashboard: response.data }}));

                // Select the item that was created
                this.selected = this.dashboards?.find((x) => { return x.id == response.data.id; });
            }
        })).catch((reason) => {
            console.error(reason);
            showSnackbar(undefined, i18next.t('errorOccurred'));
        })
    }

    private selectDashboard(id: string | Dashboard | undefined) {
        if(typeof id == 'string') {
            this.selected = this.dashboards?.find((dashboard) => { return dashboard.id == id; });
        } else {
            this.selected = id;
        }
    }

    private deleteDashboard(dashboard: Dashboard) {
        if(dashboard.id != null) {
            manager.rest.api.DashboardResource.delete({dashboardId: [dashboard.id]})
                .then((response) => {
                    if(response.status == 204) {
                        this.getAllDashboards();
                    }
                }).catch((reason) => {
                    console.error(reason);
                    showSnackbar(undefined, i18next.t('errorOccurred'));
            })
        }
    }

    /* ---------------------- */

    protected render() {
        const menuItems: ListItem[] = [
            { icon: "monitor", text: i18next.t('dashboard.size.large'), value: DashboardSizeOption.LARGE },
            { icon: "tablet", text: i18next.t('dashboard.size.medium'), value: DashboardSizeOption.MEDIUM },
            { icon: "cellphone", text: i18next.t('dashboard.size.small'), value: DashboardSizeOption.SMALL }
        ]
        const dashboardItems: ListItem[][] = []
        if(this.dashboards!.length > 0) {
            if(this.userId) {
                const myDashboards: Dashboard[] = [];
                const otherDashboards: Dashboard[] = [];
                this.dashboards?.forEach((d) => {
                    (d.ownerId == this.userId) ? myDashboards.push(d) : otherDashboards.push(d);
                })
                if(myDashboards.length > 0) {
                    const items: ListItem[] = [];
                    myDashboards.forEach((d) => { items.push({ icon: "view-dashboard", text: d.displayName, value: d.id }); });
                    dashboardItems.push(items);
                }
                if(otherDashboards.length > 0) {
                    const items: ListItem[] = [];
                    otherDashboards.forEach((d) => { items.push({ icon: "view-dashboard", text: d.displayName, value: d.id }); });
                    dashboardItems.push(items);
                }
            }
        }
        return html`
            <div id="menu-header">
                <div id="title-container">
                    <span id="title">${i18next.t('dashboards')}</span>
                </div>
                ${this.showControls ? html`
                    <div id="header-btns">
                        ${this.selected != null ? html`
                            <or-mwc-input type="${InputType.BUTTON}" icon="close" @or-mwc-input-changed="${() => { this.selectDashboard(undefined); }}"></or-mwc-input>
                            <or-mwc-input type="${InputType.BUTTON}" icon="delete" @or-mwc-input-changed="${() => { if(this.selected != null) {
                                showOkCancelDialog(i18next.t('areYouSure'), i18next.t('dashboard.deletePermanentWarning', { dashboard: this.selected.displayName }), i18next.t('delete')).then((ok: boolean) => { if(ok) { this.deleteDashboard(this.selected!); }});
                            }}}"></or-mwc-input>
                        ` : undefined}
                        <span style="--or-icon-fill: black">
                            ${getContentWithMenuTemplate(
                                    html`<or-mwc-input type="${InputType.BUTTON}" icon="plus" style="--or-icon-fill: white;"></or-mwc-input>`,
                                    menuItems, "monitor", (value: string | string[]) => {
                                        const size: DashboardSizeOption = +value;
                                        this.createDashboard(size);
                                    }
                            )}                        
                        </span>
                    </div>
                ` : undefined}
            </div>
            <div id="content">
                <div style="padding-top: 8px;">
                    ${dashboardItems.map((items, index) => {
                        return (items != null && items.length > 0) ? html`
                            <div style="padding: 8px 0;">
                                <span style="font-weight: 500; padding-left: 8px; color: #000000;">${(index == 0 ? i18next.t('dashboard.myDashboards') : i18next.t('dashboard.createdByOthers'))}</span>
                                <div id="list-container">
                                    <ol id="list">
                                        ${items.map((listItem: ListItem) => {
                                            return html`
                                                <li ?data-selected="${listItem.value == this.selected?.id}" @click="${(_evt: MouseEvent) => {
                                                    if(listItem.value != this.selected?.id) {
                                                        if(this.hasChanged) {
                                                            showOkCancelDialog(i18next.t('areYouSure'), i18next.t('confirmContinueDashboardModified'), i18next.t('discard')).then((ok: boolean) => {
                                                                if(ok) { this.selectDashboard(listItem.value); }
                                                            });
                                                        } else {
                                                            this.selectDashboard(listItem.value);
                                                        }
                                                    }
                                                }}">
                                                    <div class="node-container">
                                                        <span class="node-name">${listItem.text} </span>
                                                    </div>
                                                </li>
                                            `
                                        })}
                                    </ol>
                                </div>
                            </div>
                        ` : undefined
                    })}
                </div>
            </div>
        `
    }



    /* ------------------ */

    // TODO: Needs to be moved to probably model itself
    private getDefaultColumns(preset: DashboardSizeOption): number {
        switch (preset) {
            case DashboardSizeOption.SMALL: { return 4; }
            case DashboardSizeOption.MEDIUM: { return 8; }
            case DashboardSizeOption.LARGE: { return 12; }
            default: { return 12; }
        }
    }

    // TODO: Needs to be moved to probably model itself
    private getDefaultScreenPresets(preset: DashboardSizeOption): DashboardScreenPreset[] {
        switch (preset) {
            case DashboardSizeOption.LARGE: {
                return [{
                    id: "small",
                    displayName: i18next.t('dashboard.size.small'),
                    breakpoint: 640,
                    scalingPreset: DashboardScalingPreset.BLOCK_DEVICE
                }];
            }
            case DashboardSizeOption.SMALL: {
                return [{
                    id: "small",
                    displayName: i18next.t('dashboard.size.small'),
                    breakpoint: 640,
                    scalingPreset: DashboardScalingPreset.KEEP_LAYOUT
                }];
            }
            default: { // or DashboardSizeOption.MEDIUM since that is the default
                return [{
                    id: "small",
                    displayName: i18next.t('dashboard.size.small'),
                    breakpoint: 640,
                    scalingPreset: DashboardScalingPreset.WRAP_TO_SINGLE_COLUMN
                }];
            }
        }
    }
}
