import { manager } from "@openremote/core";
import { AppStateKeyed, HeaderItem, OrApp } from "@openremote/or-app";
import {AnyAction} from "@reduxjs/toolkit";
import { getMapRoute } from "./pages/page-map";

export function headerItemMap<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "map",
        href: getMapRoute(),
        text: "map"
    };
}

export function headerItemAssets<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "rhombus-split",
        href: "assets",
        text: "asset_plural",
    };
}

export function headerItemRules<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "state-machine",
        href: "rules",
        text: "rule_plural",
        hideMobile: true
    };
}

export function headerItemInsights<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "chart-areaspline",
        href: "insights",
        text: "insights"
    };
}

export function headerItemGatewayConnection<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "cloud",
        value: "gateway",
        href: "gateway",
        text: "gatewayConnection",
        roles: ["write:admin", "read:admin"]
    };
}

export function headerItemLanguage<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "web",
        value: "language",
        text: "language",
        action: () => {
            orApp.showLanguageModal();
        }
    };
}

export function headerItemLogout<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "logout",
        value: "logout",
        text: "logout",
        action: () => {
            orApp.logout();
        }
    };
}

export function headerItemLogs<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "text-box-search-outline",
        value: "logs",
        href: "logs",
        text: "logs",
        hideMobile: true
    };
}
export function headerItemAccount<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "account",
        value: "account",
        href: "account",
        text: "account",
        roles: {
            account: ["manage-account"]
        }
    };
}
export function headerItemUsers<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "account-group",
        value: "users",
        href: "users",
        text: "user_plural",
        roles: ["write:admin"]
    };
}
export function headerItemRoles<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "account-box-multiple",
        value: "roles",
        href: "roles",
        text: "role_plural",
        roles: ["write:admin"]
    };
}
export function headerItemRealms<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "domain",
        value: "realms",
        href: "realms",
        text: "realm_plural",
        roles: () => manager.isSuperUser()
    };
}

export function headerItemExport<S extends AppStateKeyed, A extends AnyAction>(orApp: OrApp<S>): HeaderItem {
    return {
        icon: "database-plus",
        value: "export",
        href: "data-export",
        text: "dataExport"
    };
}