import {css, html, LitElement, TemplateResult, unsafeCSS} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {classMap} from "lit/directives/class-map.js";
import {until} from 'lit/directives/until.js';
import {MDCDataTable} from "@material/data-table";
import {when} from 'lit/directives/when.js';
import {DefaultColor3, DefaultColor2, DefaultColor1} from "@openremote/core";
import {i18next} from "@openremote/or-translate";
import {InputType, OrInputChangedEvent} from "./or-mwc-input";


const dataTableStyle = require("@material/data-table/dist/mdc.data-table.css");

// language=CSS
const style = css`

    :host {
        width: 100%;
    }
    
    :host([hidden]) {
        display: none;
    }

    .mdc-data-table {
        width: 100%;
        overflow: auto;
        max-height: 500px;
    }
    .mdc-data-table__paginated {
        overflow: hidden;
        max-height: 700px;
        justify-content: space-between;
    }

    /* first column should be sticky*/
    .mdc-data-table.has-sticky-first-column tr th:first-of-type,
    .mdc-data-table.has-sticky-first-column tr td:first-of-type {
        z-index: 1;
        position: sticky;
        left: 0;
        background-color: ${unsafeCSS(DefaultColor2)};
    }
    .mdc-data-table.has-sticky-first-column tr th:first-of-type {
        z-index: 2;
    }

    thead th {
        box-shadow: 0 1px 0 0 rgb(229, 229, 229);
    }
    .mdc-data-table.has-sticky-first-column tr td:first-of-type {
        box-shadow: 1px 0 0 0 rgb(229, 229, 229);
    }
    thead th:first-of-type {
        box-shadow: 1px 1px 0 0 rgb(229, 229, 229);
    }

    th {
        position: sticky;
        top: 0;
        background-color: ${unsafeCSS(DefaultColor1)};
    }

    th, td {
        cursor: default;
    }
    
    th:not(:first-of-type), td:not(:first-of-type) {
        max-width: 100px;
        text-overflow: ellipsis;
    }

    .mdc-data-table__header-cell {
        font-weight: bold;
        color: ${unsafeCSS(DefaultColor3)};
        font-size: 14px;
    }
    .mdc-data-table__pagination-rows-per-page-select {
        /*min-width: 112px;*/
    }
    .mdc-data-table__pagination {
        min-height: 64px;
    }
`;

interface TableConfig {
    columnFilter?: string[];
    stickyFirstColumn?: boolean;
    pagination?: {
        enable?: boolean
    }
}
export interface TableColumn {
    title?: string,
    isNumeric?: boolean,
    hideMobile?: boolean
}
export interface OrMwcTableRowClickDetail {
    index: number
}

export class OrMwcTableRowClickEvent extends CustomEvent<OrMwcTableRowClickDetail> {

    public static readonly NAME = "or-mwc-table-row-click";

    constructor(index: number) {
        super(OrMwcTableRowClickEvent.NAME, {
            detail: {
                index: index
            },
            bubbles: true,
            composed: true
        });
    }
}

@customElement("or-mwc-table")
export class OrMwcTable extends LitElement {

    static get styles() {
        return [
            css`${unsafeCSS(dataTableStyle)}`,
            style
        ];
    }

    @property({type: Array})
    public columns?: TableColumn[] | string[];

    @property({type: Object})
    protected columnsTemplate?: TemplateResult;

    @property({type: Array})
    public rows?: string[][];

    @property({type: Object}) // to manually control HTML (requires td and tr elements)
    protected rowsTemplate?: TemplateResult;

    @property({type: Number})
    protected paginationIndex: number = 0;

    @property({type: Number})
    protected paginationSize: number = 10;

    @property({type: Array})
    protected config: TableConfig = {
        columnFilter: [],
        stickyFirstColumn: true,
        pagination: {
            enable: false
        }
    };

    @state()
    protected _dataTable?: MDCDataTable;


    /* ------------------- */

    protected firstUpdated(changedProperties: Map<string, any>) {
        const elem = this.shadowRoot!.querySelector('.mdc-data-table');
        this._dataTable = new MDCDataTable(elem!);
        this.updateComplete.then(() => {
            (elem as HTMLElement).style.maxHeight = elem!.clientHeight + 2 + "px"; // to keep initial height of table, instead of making it larger when paginationSize changes.
            (elem as HTMLElement).style.minHeight = elem!.clientHeight + 2 + "px";
        })
    }

    protected updated(changedProperties: Map<string, any>) {
        if((changedProperties.has('paginationIndex') || changedProperties.has('paginationSize')) && this.config.pagination?.enable) {
            const elem = (this._dataTable ? this._dataTable.root.children[0] : this.shadowRoot!.querySelector('.mdc-data-table__table-container'));

            // Using an observer to prevent forced reflow / DOM measurements; prevents blocking the thread
            const observer = new IntersectionObserver((entries, observer) => {
                (entries[0].target as HTMLElement).scrollTop = 0;
                observer.unobserve(entries[0].target);
            })
            observer.observe(elem!);
        }
    }

    protected render() {
        const tableClasses = {
            "mdc-data-table": true,
            "mdc-data-table__paginated": !!this.config.pagination,
            "has-sticky-first-column": !!this.config.stickyFirstColumn
        }
        return html`
            <div class="${classMap(tableClasses)}">
                <div class="mdc-data-table__table-container">
                    <table class="mdc-data-table__table">
                        ${when(this.columnsTemplate, () => this.columnsTemplate, () => {
                            return this.columns ? html`
                                <thead>
                                    <tr class="mdc-data-table__header-row">
                                        ${this.columns.map((column: TableColumn | string) => {
                                            if(typeof column == "string") {
                                                return html`<th class="mdc-data-table__header-cell" role="columnheader" scope="col" title="${column}">${column}</th>`
                                            } else {
                                                return html`<th class="mdc-data-table__header-cell ${classMap({ 'mdc-data-table__cell--numeric': !!column.isNumeric })}" role="columnheader" scope="col" title="${column.title}">${column.title}</th>`;
                                            }
                                        })}
                                    </tr>
                                </thead>
                            ` : undefined;
                        })}
                        <tbody class="mdc-data-table__content">
                            ${when(this.rowsTemplate, () => {
                                this.updateComplete.then(async () => {
                                    const elem = await this.getTableElem(false);
                                    const rows = elem?.querySelectorAll('tr');
                                    rows?.forEach((row, index) => {
                                        const hidden = (index <= (this.paginationIndex * this.paginationSize) || index > (this.paginationIndex * this.paginationSize) + this.paginationSize) && !row.classList.contains('mdc-data-table__header-row');
                                        row.style.display = (hidden ? 'none' : 'table-row');
                                    })
                                })
                                return html`${this.rowsTemplate}`;
                            }, () => {
                                return this.rows ? this.rows
                                        .filter((row, index) => (index >= (this.paginationIndex * this.paginationSize)) && (index < (this.paginationIndex * this.paginationSize + this.paginationSize)))
                                        .map(item => html`
                                            <tr class="mdc-data-table__row" @click="${(ev: MouseEvent) => this.dispatchEvent(new OrMwcTableRowClickEvent(this.rows?.indexOf(item)!))}">
                                                ${item.map((cell: string|number) => html`<td class="mdc-data-table__cell ${classMap({"mdc-data-table__cell--numeric": typeof cell === "number"})}" title="${cell}">${cell}</td>`)}
                                            </tr>
                                        `)
                                : undefined;
                            })}
                        </tbody>
                    </table>
                </div>
                ${when(this.config.pagination, () => {
                    return html`
                        <div class="mdc-data-table__pagination">
                            <div class="mdc-data-table__pagination-trailing">
                                <div class="mdc-data-table__pagination-rows-per-page">
                                    <div class="mdc-data-table__pagination-rows-per-page-label">
                                        ${i18next.t('rowsPerPage')}
                                    </div>
                                    <or-mwc-input class="mdc-data-table__pagination-rows-per-page-select" .type="${InputType.SELECT}" compact comfortable outlined .value="${this.paginationSize}" .options="${[10, 25, 100]}"
                                                  @or-mwc-input-changed="${(ev: OrInputChangedEvent) => { this.paginationSize = ev.detail.value; this.paginationIndex = 0; }}"
                                    ></or-mwc-input>
                                </div>
                                ${until(this.getPaginationControls(), html`${i18next.t('loading')}`)}
                            </div>
                        </div>
                    `
                })}
            </div>
        `;
    }

    // HTML for the controls on the bottom of the table.
    // Includes basic pagination for browsing pages, with calculations of where to go.
    async getPaginationControls(): Promise<TemplateResult> {
        const max: number = await this.getRowCount();
        const start: number = (this.paginationIndex * this.paginationSize) + 1;
        let end: number = this.paginationIndex * this.paginationSize + this.paginationSize;
        if(end > max) { end = max; }
        return html`
            <div class="mdc-data-table__pagination-navigation">
                <div class="mdc-data-table__pagination-total">
                    <span>${start}-${end} of ${max}</span>
                </div>
                <or-mwc-input class="mdc-data-table__pagination-button" .type="${InputType.BUTTON}" data-first-page="true" icon="page-first" .disabled="${this.paginationIndex == 0}" @or-mwc-input-changed="${() => this.paginationIndex = 0}"></or-mwc-input>
                <or-mwc-input class="mdc-data-table__pagination-button" .type="${InputType.BUTTON}" data-prev-page="true" icon="chevron-left" .disabled="${this.paginationIndex == 0}" @or-mwc-input-changed="${() => this.paginationIndex--}"></or-mwc-input>
                <or-mwc-input class="mdc-data-table__pagination-button" .type="${InputType.BUTTON}" data-next-page="true" icon="chevron-right" .disabled="${this.paginationIndex * this.paginationSize + this.paginationSize >= max}" @or-mwc-input-changed="${() => this.paginationIndex++}"></or-mwc-input>
                <or-mwc-input class="mdc-data-table__pagination-button" .type="${InputType.BUTTON}" data-last-page="true" icon="page-last" .disabled="${this.paginationIndex * this.paginationSize + this.paginationSize >= max}" @or-mwc-input-changed="${async () => {
                    let pages: number = max / this.paginationSize;
                    pages = pages.toString().includes('.') ? Math.floor(pages) : (pages - 1);
                    this.paginationIndex = pages;
                }}"></or-mwc-input>
            </div>
        `;
    }

    // Getting the amount of rows/entries in the table.
    // Makes sure that both the rows, and rowsTemplate properties work.
    async getRowCount(wait: boolean = true, tableElem?: HTMLElement): Promise<number> {
        if(this.rows?.length) { return this.rows?.length; }
        if(!tableElem) {
            tableElem = await this.getTableElem(wait);
        }
        const rowElems = tableElem?.querySelectorAll('tr');
        return rowElems!.length;
    }

    async getTableElem(wait: boolean = false): Promise<HTMLElement | undefined> {
        if(wait) { await this.updateComplete; }
        if(this._dataTable) { return this._dataTable.root as HTMLElement; }
        else { return this.shadowRoot!.querySelector('.mdc-data-table') as HTMLElement; }
    }

}
