import manager, { DefaultColor4 } from "@openremote/core";
import maplibregl,{
    AnyLayer,
    Control,
    GeoJSONSource,
    GeolocateControl,
    IControl,
    LngLat,
    LngLatLike,
    Map as MapGL,
    MapboxOptions as OptionsGL,
    MapMouseEvent,
    Marker as MarkerGL,
    NavigationControl,
    Style as StyleGL,
    Popup
} from "maplibre-gl";
import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import { debounce } from "lodash";
import {
    ControlPosition,
    OrMapClickedEvent,
    OrMapGeocoderChangeEvent,
    OrMapLoadedEvent,
    OrMapLongPressEvent,
    ViewSettings,
    OrMapMarkerClickedEvent,
    OrMapMarkerAsset, MapMarkerAssetConfig, OrMapMovedEvent, OrMapSourceLoadedEvent, getMarkerConfigForAssetType
} from "./index";
import { OrMapMarker } from "./markers/or-map-marker";
import {getLatLngBounds, getLngLat, getMarkerIconAndColorFromAssetType, OverrideConfigSettings} from "./util";
import { Asset, AssetModelUtil } from "@openremote/model";
import {GeoJsonConfig, MapType } from "@openremote/model";
import { Feature, FeatureCollection } from "geojson";

const mapboxJsStyles = require("mapbox.js/dist/mapbox.css");
const maplibreGlStyles = require("maplibre-gl/dist/maplibre-gl.css");
const maplibreGeoCoderStyles = require("@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css");

// TODO: fix any type
const metersToPixelsAtMaxZoom = (meters: number, latitude: number) =>
  meters / 0.075 / Math.cos(latitude * Math.PI / 180);


export class MapWidget {
    protected _mapJs?: L.mapbox.Map;
    protected _mapGl?: MapGL;
    protected _type: MapType;
    protected _styleParent: Node;
    protected _mapContainer: HTMLElement;
    protected _loaded: boolean = false;
    protected _markersJs: Map<OrMapMarker, L.Marker> = new Map();
    protected _markersGl: Map<OrMapMarker, MarkerGL> = new Map();
    protected _geoJsonConfig?: GeoJsonConfig;
    protected _geoJsonSources: string[] = [];
    protected _geoJsonLayers: Map<string, any> = new Map();
    protected _viewSettings?: ViewSettings;
    protected _center?: LngLatLike;
    protected _zoom?: number;
    protected _showGeoCodingControl: boolean = false;
    protected _showBoundaryBox: boolean = false;
    protected _useZoomControls: boolean = true;
    protected _showGeoJson: boolean = true;
    protected _controls?: (Control | IControl | [Control | IControl, ControlPosition?])[];
    protected _clickHandlers: Map<OrMapMarker, (ev: MouseEvent) => void> = new Map();
    protected _geocoder?: any;
    protected popup: Popup | undefined = undefined;
    protected popupClusterId: string | undefined = undefined;
    protected markerConfig: MapMarkerAssetConfig | undefined;
    protected currentMarkers: MarkerGL[] = [];

    protected _pointsMap: any = {
        type: "FeatureCollection",
        features: []
    };

    protected _assetTypesColors: any = {};
    protected _markers: maplibregl.Marker[] = [];

    constructor(type: MapType, styleParent: Node, mapContainer: HTMLElement, showGeoCodingControl: boolean = false, showBoundaryBox = false, useZoomControls = true, showGeoJson = true) {
        this._type = type;
        this._styleParent = styleParent;
        this._mapContainer = mapContainer;
        this._showGeoCodingControl = showGeoCodingControl;
        this._showBoundaryBox = showBoundaryBox;
        this._useZoomControls = useZoomControls;
        this._showGeoJson = showGeoJson;
    }

    public setCenter(center?: LngLatLike): this {

        this._center = getLngLat(center);

        switch (this._type) {
            case MapType.RASTER:
                if (this._mapJs) {
                    const latLng = getLngLat(this._center) || (this._viewSettings ? getLngLat(this._viewSettings.center) : undefined);
                    if (latLng) {
                        this._mapJs.setView(latLng, undefined, {pan: {animate: false}, zoom: {animate: false}});
                    }
                }
                break;
            case MapType.VECTOR:
                if (this._mapGl && this._center) {
                    this._mapGl.setCenter(this._center);
                }
                break;
        }

        return this;
    }

    public flyTo(coordinates?:LngLatLike, zoom?: number): this {
        switch (this._type) {
            case MapType.RASTER:
                if (this._mapJs) {
                    // TODO implement fylTo
                }
                break;
            case MapType.VECTOR:
                if (!coordinates) {
                    coordinates = this._center ? this._center : this._viewSettings ? this._viewSettings.center : undefined;
                }

                if (!zoom) {
                    zoom = this._zoom ? this._zoom : this._viewSettings && this._viewSettings.zoom ? this._viewSettings.zoom : undefined;
                }

                if (this._mapGl) {
                    // Only do flyTo if it has valid LngLat value
                    if(coordinates) {
                        this._mapGl.flyTo({
                            center: coordinates,
                            zoom: zoom
                        });
                    }
                } else {
                    this._center = coordinates;
                    this._zoom = zoom;
                }
                break;
        }

        return this;
    }

    public resize(): this {

        switch (this._type) {
            case MapType.RASTER:
                if (this._mapJs) {
                }
                break;
            case MapType.VECTOR:
                if (this._mapGl) {
                    this._mapGl.resize()
                }
                break;
        }

        return this;
    }

    public setZoom(zoom?: number): this {

        this._zoom = zoom;

        switch (this._type) {
            case MapType.RASTER:
                if (this._mapJs && this._zoom) {
                    this._mapJs.setZoom(this._zoom, {animate: false});
                }
                break;
            case MapType.VECTOR:
                if (this._mapGl && this._zoom) {
                    this._mapGl.setZoom(this._zoom);
                }
                break;
        }

        return this;
    }

    public setControls(controls?: (Control | IControl | [Control | IControl, ControlPosition?])[]): this {
        this._controls = controls;
        if (this._mapGl) {
            if (this._controls) {
                this._controls.forEach((control) => {
                    if (Array.isArray(control)) {
                        const controlAndPosition: [Control | IControl, ControlPosition?] = control;
                        this._mapGl!.addControl(controlAndPosition[0], controlAndPosition[1]);
                    } else {
                        this._mapGl!.addControl(control);
                    }
                });
            } else {
                // Add zoom and rotation controls to the map
                this._mapGl.addControl(new NavigationControl());
            }
        }
        return this;
    }

    public setGeoJson(geoJsonConfig?: GeoJsonConfig): this {
        this._geoJsonConfig = geoJsonConfig;
        if(this._mapGl) {
            if(this._geoJsonConfig) {
                this.loadGeoJSON(this._geoJsonConfig);
            } else {
                this.loadGeoJSON(this._viewSettings?.geoJson);
            }
        }
        return this;
    }

    public async loadViewSettings() {

        let settingsResponse;
        if (this._type === MapType.RASTER) {
            settingsResponse = await manager.rest.api.MapResource.getSettingsJs();
        } else {
            settingsResponse = await manager.rest.api.MapResource.getSettings();
        }
        const settings = settingsResponse.data as any;

        // Load options for current realm or fallback to default if exist
        const realmName = manager.displayRealm || "default";
        this._viewSettings = settings.options ? settings.options[realmName] ? settings.options[realmName] : settings.options.default : null;

        if (this._viewSettings) {

            // If Map was already present, so only ran during updates such as realm switches
            if (this._mapGl) {
                this._mapGl.setMinZoom(this._viewSettings.minZoom);
                this._mapGl.setMaxZoom(this._viewSettings.maxZoom);
                if (this._viewSettings.bounds){
                    this._mapGl.setMaxBounds(this._viewSettings.bounds);
                }
                // Unload all GeoJSON that is present, and load new layers if present
                if(this._geoJsonConfig) {
                    await this.loadGeoJSON(this._geoJsonConfig);
                } else {
                    await this.loadGeoJSON(this._viewSettings?.geoJson);
                }
            }
            if (!this._center) {
                this.setCenter(this._viewSettings.center);
            } else {
                this.setCenter(this._center);
            }
        }

        return settings;
    }

    public async load(): Promise<void> {
        if (this._loaded) {
            return;
        }

        if (this._type === MapType.RASTER) {

            // Add style to shadow root
            const style = document.createElement("style");
            style.id = "mapboxJsStyle";
            style.textContent = mapboxJsStyles;
            this._styleParent.appendChild(style);
            const settings = await this.loadViewSettings();

            let options: L.mapbox.MapOptions | undefined;
            if (this._viewSettings) {
                options = {};

                // JS zoom is out compared to GL
                options.zoom = this._viewSettings.zoom ? this._viewSettings.zoom + 1 : undefined;

                if (this._useZoomControls){
                    options.maxZoom = this._viewSettings.maxZoom ? this._viewSettings.maxZoom - 1 : undefined;
                    options.minZoom = this._viewSettings.minZoom ? this._viewSettings.minZoom + 1 : undefined;
                }
                options.boxZoom = this._viewSettings.boxZoom;

                // JS uses lat then lng unlike GL
                if (this._viewSettings.bounds) {
                    options.maxBounds = getLatLngBounds(this._viewSettings.bounds);
                }
                if (this._viewSettings.center) {
                    const lngLat = getLngLat(this._viewSettings.center);
                    options.center = lngLat ? L.latLng(lngLat.lat, lngLat.lng) : undefined;
                }
                if (this._center) {
                    const lngLat = getLngLat(this._center);
                    options.center = lngLat ? L.latLng(lngLat.lat, lngLat.lng) : undefined;
                }
                if (this._zoom) {
                    options.zoom = this._zoom + 1;
                }
            }

            this._mapJs = L.mapbox.map(this._mapContainer, settings, options);

            this._mapJs.on("click", (e: any)=> {
                this._onMapClick(e.latlng);
            });

            if (options && options.maxBounds) {
                const minZoom = this._mapJs.getBoundsZoom(options.maxBounds, true);
                if (!options.minZoom || options.minZoom < minZoom) {
                    (this._mapJs as any).setMinZoom(minZoom);
                }
            }
        } else {
            // Add style to shadow root
            let style = document.createElement("style");
            style.id = "maplibreGlStyle";
            style.textContent = maplibreGlStyles;
            this._styleParent.appendChild(style);

            style = document.createElement("style");
            style.id = "maplibreGeoCoderStyles";
            style.textContent = maplibreGeoCoderStyles;
            this._styleParent.appendChild(style);

            const map: typeof import("maplibre-gl") = await import(/* webpackChunkName: "maplibre-gl" */ "maplibre-gl");
            const settings = await this.loadViewSettings();
                
            const options: OptionsGL = {
                attributionControl: true,
                container: this._mapContainer,
                style: settings as StyleGL,
                transformRequest: (url, resourceType) => {
                    return {
                        headers: {Authorization: manager.getAuthorizationHeader()},
                        url
                    };
                }
            };

            if (this._viewSettings) {
                if (this._useZoomControls){
                    options.maxZoom = this._viewSettings.maxZoom
                    options.minZoom = this._viewSettings.minZoom
                }
                if (this._viewSettings.bounds && !this._showBoundaryBox){
                    options.maxBounds = this._viewSettings.bounds;
                }

                options.boxZoom = this._viewSettings.boxZoom;
                options.zoom = this._viewSettings.zoom;
                options.center = this._viewSettings.center;
            }

            this._center = this._center || (this._viewSettings ? this._viewSettings.center : undefined);
            options.center = this._center;

            if (this._zoom) {
                options.zoom = this._zoom;
            }

            this._mapGl = new map.Map(options);

            await this.styleLoaded();

            this._mapGl.on("click", (e: MapMouseEvent) => {
                this._onMapClick(e.lngLat);
            });

            this._mapGl.on("dblclick", (e: MapMouseEvent) => {
                this._onMapClick(e.lngLat, true);
            });

            this._mapGl.on('moveend', () => {
                this._mapContainer.dispatchEvent(new OrMapMovedEvent());
                this.renderCurrentCluster();
            });

            if (this._showGeoCodingControl && this._viewSettings && this._viewSettings.geocodeUrl) {
                this._geocoder = new MaplibreGeocoder({forwardGeocode: this._forwardGeocode.bind(this), reverseGeocode: this._reverseGeocode }, { maplibregl: maplibregl, showResultsWhileTyping: true });
                // Override the _onKeyDown function from MaplibreGeocoder which has a bug getting the value from the input element
                this._geocoder._onKeyDown = debounce((e: KeyboardEvent) => {
                    var ESC_KEY_CODE = 27,
                    TAB_KEY_CODE = 9;
              
                  if (e.keyCode === ESC_KEY_CODE && this._geocoder.options.clearAndBlurOnEsc) {
                    this._geocoder._clear(e);
                    return this._geocoder._inputEl.blur();
                  }
              
                  // if target has shadowRoot, then get the actual active element inside the shadowRoot
                  var value = this._geocoder._inputEl.value || e.key;
              
                  if (!value) {
                    this._geocoder.fresh = true;
                    // the user has removed all the text
                    if (e.keyCode !== TAB_KEY_CODE) this._geocoder.clear(e);
                    return (this._geocoder._clearEl.style.display = "none");
                  }
              
                  // TAB, ESC, LEFT, RIGHT, UP, DOWN
                  if (
                    e.metaKey ||
                    [TAB_KEY_CODE, ESC_KEY_CODE, 37, 39, 38, 40].indexOf(e.keyCode) !== -1
                  )
                    return;
              
                  // ENTER
                  if (e.keyCode === 13) {
                    if (!this._geocoder.options.showResultsWhileTyping) {
                      if (!this._geocoder._typeahead.list.selectingListItem)
                      this._geocoder._geocode(value);
                    } else {
                      if (this._geocoder.options.showResultMarkers) {
                        this._geocoder._fitBoundsForMarkers();
                      }
                      this._geocoder._inputEl.value = this._geocoder._typeahead.query;
                      this._geocoder.lastSelected = null;
                      this._geocoder._typeahead.selected = null;
                      return;
                    }
                  }
              
                  if (
                    value.length >= this._geocoder.options.minLength &&
                    this._geocoder.options.showResultsWhileTyping
                  ) {
                    this._geocoder._geocode(value);
                  }
                }, 300);
                this._mapGl!.addControl(this._geocoder, 'top-left');

                this._mapGl!.addSource('mapPoints', {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                });

                // There's no callback parameter in the options of the MaplibreGeocoder,
                // so this is how we get the selected result.
                this._geocoder._inputEl.addEventListener("change", () => {
                    var selected = this._geocoder._typeahead.selected;
                    this._onGeocodeChange(selected);
                });                
            }

            // Add custom controls
            if (this._controls) {
                this._controls.forEach((control) => {
                    if (Array.isArray(control)) {
                        const controlAndPosition: [Control | IControl, ControlPosition?] = control;
                        this._mapGl!.addControl(controlAndPosition[0], controlAndPosition[1]);
                    } else {
                        this._mapGl!.addControl(control);
                    }
                });
            } else {
                // Add zoom and rotation controls to the map
                this._mapGl.addControl(new NavigationControl());
                // Add current location controls to the map
                this._mapGl.addControl(new GeolocateControl({
                    positionOptions: {
                        enableHighAccuracy: true
                    },
                    showAccuracyCircle: true,
                    showUserLocation: true
                }));
            }

            // Unload all GeoJSON that is present, and load new layers if present
            if(this._geoJsonConfig) {
                await this.loadGeoJSON(this._geoJsonConfig);
            } else {
                await this.loadGeoJSON(this._viewSettings?.geoJson);
            }

            this._initLongPressEvent();
        }

        this._mapContainer.dispatchEvent(new OrMapLoadedEvent());
        this._loaded = true;
        this.createBoundaryBox()
    }

    protected styleLoaded(): Promise<void> {
        return new Promise(resolve => {
            if (this._mapGl) {

                this._mapGl.once('style.load', () => {
                    resolve();
                });
            }
        });
    }

    // Clean up of internal resources associated with the map.
    // Normally used during disconnectedCallback
    public unload() {
        if(this._mapGl) {
            this._mapGl.remove();
            this._mapGl = undefined;
        }
        if(this._mapJs) {
            this._mapJs.remove();
            this._mapJs = undefined;
        }
    }

    protected _onMapClick(lngLat: LngLat, doubleClicked: boolean = false) {
        this._mapContainer.dispatchEvent(new OrMapClickedEvent(lngLat, doubleClicked));
    }

    protected async loadGeoJSON(geoJsonConfig?: GeoJsonConfig) {

        // Remove old layers
        if(this._geoJsonLayers.size > 0) {
            this._geoJsonLayers.forEach((layer, layerId) => this._mapGl!.removeLayer(layerId));
            this._geoJsonLayers = new Map();
        }
        // Remove old sources
        if(this._geoJsonSources.length > 0) {
            this._geoJsonSources.forEach((sourceId) => this._mapGl!.removeSource(sourceId));
            this._geoJsonSources = [];
        }

        // Add new ones if present
        if (this._showGeoJson && geoJsonConfig) {

            // If array of features (most of the GeoJSONs use this)
            if(geoJsonConfig.source.type == "FeatureCollection") {
                const groupedSources = this.groupSourcesByGeometryType(geoJsonConfig.source);
                groupedSources?.forEach((features, type) => {
                    const newSource = {
                        type: "geojson",
                        data: {
                            type: "FeatureCollection",
                            features: features
                        }
                    } as any as GeoJSONSource;
                    const sourceInfo = this.addGeoJSONSource(newSource);
                    if(sourceInfo) {
                        this.addGeoJSONLayer(type, sourceInfo.sourceId);
                    }
                })

                // Or only 1 feature is added
            } else if(geoJsonConfig.source.type == "Feature") {
                const sourceInfo = this.addGeoJSONSource(geoJsonConfig.source);
                if(sourceInfo) {
                    this.addGeoJSONLayer(sourceInfo.source.type, sourceInfo.sourceId);
                }
            } else {
                console.error("Could not create layer since source type is neither 'FeatureCollection' nor 'Feature'.")
            }
        }
    }

    public groupSourcesByGeometryType(sources: FeatureCollection): Map<string, Feature[]> | undefined {
        const groupedSources: Map<string, Feature[]> = new Map();
        sources.features.forEach((feature) => {
            let sources: Feature[] | undefined = groupedSources.get(feature.geometry.type);
            if(sources == undefined) { sources = []; }
            sources.push(feature);
            groupedSources.set(feature.geometry.type, sources);
        })
        return groupedSources;
    }

    public addGeoJSONSource(source: GeoJSONSource): { source: GeoJSONSource, sourceId: string } | undefined {
        if(!this._mapGl) {
            console.error("mapGl instance not found!"); return;
        }
        const id = Date.now() + "-" + (this._geoJsonSources.length + 1);
        this._mapGl.addSource(id, source)
        this._geoJsonSources.push(id);
        return {
            source: source,
            sourceId: id
        }
    }

    public addGeoJSONLayer(typeString: string, sourceId: string) {
        if(!this._mapGl) {
            console.error("mapGl instance not found!"); return;
        }

        const type = typeString as "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "GeometryCollection"
        const layerId = sourceId + "-" + type;

        // If layer is not added yet
        if( this._geoJsonLayers.get(layerId) == undefined) {

            // Get realm color by getting value from CSS
            let realmColor: string = getComputedStyle(this._mapContainer).getPropertyValue('--or-app-color4');
            if(realmColor == undefined || realmColor.length == 0) {
                realmColor = DefaultColor4;
            }

            let layer = {
                id: layerId,
                source: sourceId
            } as any;

            // Set styling based on type
            switch (type) {
                case "Point":
                case "MultiPoint": {
                    layer.type = "circle";
                    layer.paint = {
                        'circle-radius': 12,
                        'circle-color': realmColor
                    }
                    this._geoJsonLayers.set(layerId, layer);
                    this._mapGl.addLayer(layer);
                    break;
                }
                case "LineString":
                case "MultiLineString": {
                    layer.type = "line";
                    layer.paint = {
                        'line-color': realmColor,
                        'line-width': 4
                    };
                    this._geoJsonLayers.set(layerId, layer);
                    this._mapGl.addLayer(layer);
                    break;
                }
                case "Polygon":
                case "MultiPolygon": {
                    layer.type = "fill";
                    layer.paint = {
                        'fill-color': realmColor,
                        'fill-opacity': 0.3
                    };
                    this._geoJsonLayers.set(layerId, layer);
                    this._mapGl.addLayer(layer);

                    // Add extra layer with outline
                    const outlineId = layerId + "-outline";
                    const outlineLayer = {
                        id: outlineId,
                        source: sourceId,
                        type: "line",
                        paint: {
                            'line-color': realmColor,
                            'line-width': 2
                        },
                    } as AnyLayer
                    this._geoJsonLayers.set(outlineId, outlineLayer);
                    this._mapGl.addLayer(outlineLayer);
                    break;
                }
                case "GeometryCollection": {
                    console.error("GeometryCollection GeoJSON is not implemented yet!");
                    return;
                }
            }
        }
    }

    public addMarker(marker: OrMapMarker) {
        if (marker.hasPosition()) {
            this._updateMarkerElement(marker, true);
        }
    }

    public getCurrentView(centre?: LngLatLike): string[] {
        if (this._mapGl) {
            const res2 = this._mapGl.querySourceFeatures('mapPoints', { sourceLayer: 'unclustered-point' });

            console.log(res2);

            let viewedAsset: any = {};
            let assetId: string[] = [];

            res2.forEach((marker) => {
                if (marker.properties && !marker.properties.cluster && !viewedAsset[marker.properties.id]) {
                    viewedAsset[marker.properties.id] = marker.properties;
                    assetId.push(marker.properties.id);
                }
            });

            return assetId;
        } else {
            return [];
        }
    }

    /**
     * Methods from maplibre example for Cluster with Donut Chart
     */
    protected createDonutChart(props: any[], maxClusterCount: number = 1000): ChildNode | null {
        const offsets: any[] = [];
        const subOffsets: any[] = [];
        const counts: any[] = [];
        const subCounts: any[] = [];
        const subColours: string[] = [];
        props.forEach(p => {
            counts.push(p.count);
            p.threshold.forEach((t: any) => {
                subCounts.push(t.count);
                subColours.push(t.color);
            });
        });

        let total: number = 0;
        let subTotal: number = 0;
        for (let i: number = 0; i < counts.length; i++) {
            offsets.push(total);
            total += counts[i];
        }

        for (let i: number = 0; i < subCounts.length; i++) {
            subOffsets.push(subTotal);
            subTotal += subCounts[i];
        }

        const highTreshold: number = maxClusterCount - (maxClusterCount * 20 / 100);
        const midTreshold: number = highTreshold / 10;
        const lowTreshold: number = midTreshold / 10;

        const fontSize =
            total >= highTreshold ? 22 : total >= midTreshold ? 20 : total >= lowTreshold ? 18 : 16;
        const r = total >= highTreshold ? 50 : total >= midTreshold ? 32 : total >= lowTreshold ? 24 : 18;
        const r2 = total >= highTreshold ? 32 : total >= midTreshold ? 26 : total >= lowTreshold ? 20 : 15;
        const dR = r - r2;
        const r0: number = Math.round(r * 0.6);
        const w: number = r * 2;

        let html =
            `<div><svg width="${
                w
            }" height="${
                w
            }" viewbox="0 0 ${
                w
            } ${
                w
            }" text-anchor="middle" style="font: ${
                fontSize
            }px sans-serif; display: block">`;

        //Threshold donut
        for (let i: number = 0; i < subCounts.length; i++) {
            html += this.donutSegment(
                subOffsets[i] / subTotal,
                (subOffsets[i] + subCounts[i]) / subTotal,
                r,
                r0,
                subColours[i], true, 0
            );
        }

        for (let i: number = 0; i < counts.length; i++) {
            html += this.donutSegment(
                offsets[i] / total,
                (offsets[i] + counts[i]) / total,
                r2,
                r0,
                this._assetTypesColors[props[i].assetType], false, dR
            );
        }

        html +=
            `<circle cx="${
                r
            }" cy="${
                r
            }" r="${
                r0
            }" fill="white" /><text dominant-baseline="central" transform="translate(${
                r
            }, ${
                r
            })">${
                total.toLocaleString()
            }</text></svg></div>`;

        const el = document.createElement('div');
        el.innerHTML = html;
        return el.firstChild;
    }

    /**
     * Methods from maplibre example for Cluster with Donut Chart
     */
    protected donutSegment(start: number, end: number, r: number, r0: number, color: string, sub: boolean, dR: number): string {
        if (end - start === 1) {
            end -= 0.00001;
        }
        const a0: number = 2 * Math.PI * (start - 0.25);
        const a1: number = 2 * Math.PI * (end - 0.25);
        const x0: number = Math.cos(a0),
            y0: number = Math.sin(a0);
        const x1: number = Math.cos(a1),
            y1: number = Math.sin(a1);
        const largeArc: 1 | 0 = end - start > 0.5 ? 1 : 0;

        return [
            '<path d="M',
            r + r0 * x0,
            r + r0 * y0,
            'L',
            r + r * x0,
            r + r * y0,
            'A',
            r,
            r,
            0,
            largeArc,
            1,
            r + r * x1,
            r + r * y1,
            'L',
            r + r0 * x1,
            r + r0 * y1,
            'A',
            r0,
            r0,
            0,
            largeArc,
            0,
            r + r0 * x0,
            r + r0 * y0,
            `" fill="#${color}" ${!sub ? `transform="translate(${dR}, ${dR})"` : ""} />`
        ].join(' ');
    }
    public renderCurrentCluster(config?: MapMarkerAssetConfig): void {
        if (config) {
            console.log('got a marker config...');
            console.log(config);
            this.markerConfig = config;
        }

        if (this._mapGl) {
            const features = this._mapGl.querySourceFeatures('mapPoints', {sourceLayer: 'clusters'});

            this._markers.forEach((marker: maplibregl.Marker) => {
                marker.remove();
            })

            let totalCount: number = 0;

            let clusters = features.filter((feature) => {
                return feature.properties && feature.properties.cluster;
            });

            console.log("clusters : ");
            console.log(clusters);

            clusters.forEach((cluster: any) => {
                if (this._mapGl) {
                    totalCount += cluster.properties.point_count;
                }
            });

            clusters.forEach((cluster: any) => {
                if (this._mapGl) {
                    let props: any[] = [];
                    /**
                     * {
                     *     count: 50,
                     *     assetType: 'assetTYpe',
                     *     threshold: [
                     *         {
                     *             count: 10,
                     *             color: '#color1'
                     *         }, {
                     *             count: 40,
                     *             color: '#color2'
                     *         }
                     *     ]
                     * }
                     */

                    let sourcePoints: GeoJSONSource = (this._mapGl.getSource('mapPoints') as GeoJSONSource);
                    sourcePoints.getClusterLeaves(cluster.properties.cluster_id, cluster.properties.point_count, 0, (err, aFeatures) => {
                        aFeatures.forEach((feature) => {
                            let assetType = feature.properties?.assetType;

                            if (assetType) {
                                console.log(this.markerConfig);
                                const assetTypeConfig = getMarkerConfigForAssetType(this.markerConfig, assetType);
                                let iconAndColour: any = undefined;

                                if(assetTypeConfig && assetTypeConfig.colours && feature.properties) {
                                    const assetAttributeValue = feature.properties.asset.attributes[assetTypeConfig.attributeName].value;
                                    let overrideOpts: OverrideConfigSettings = {
                                        markerConfig: assetTypeConfig.colours,
                                        currentValue: assetAttributeValue
                                    };

                                    iconAndColour = getMarkerIconAndColorFromAssetType(assetType, overrideOpts);
                                } else {
                                    //console.log('no colours treshold defined on asset type ' + assetType);
                                }


                                let findIndex = props.findIndex((prop: any) => { return assetType === prop.assetType});
                                if (findIndex !== -1) {
                                    props[findIndex].count++;
                                } else {
                                    props.push({
                                        assetType: assetType,
                                        count: 1
                                    });
                                }

                                if (iconAndColour) {
                                    findIndex = props.length - 1;

                                    let thresholdIndex = props[findIndex].threshold.findIndex((t: any) => { return t.color === iconAndColour.color; });

                                    if (thresholdIndex !== -1) {
                                        props[findIndex].threshold[thresholdIndex].count++;
                                    } else {
                                        props[findIndex].threshold.push({
                                            count: 1,
                                            color: iconAndColour.color
                                        });
                                    }
                                }
                            }
                        });

                        props.forEach((prop: any) => {
                            if (!prop.threshold) {
                                prop.threshold = [ {
                                    count: prop.count,
                                    color: this._assetTypesColors[prop.assetType]
                                } ];
                            }
                        });

                        let donutChart = this.createDonutChart(props, totalCount);

                        // @ts-ignore
                        this._markers.push(new maplibregl.Marker({element: donutChart}).setLngLat(cluster.geometry['coordinates']).addTo(this._mapGl));
                    });
                }
            });
        }
    }

    public loadPoints() {
        if (!this._mapGl) {
            this.load();
        } else {
            console.log('asset colors :');
            console.log(this._assetTypesColors);
            if (this._mapGl.getSource('mapPoints')) {
                if (this._mapGl.getLayer('unclustered-point')) {
                    this._mapGl.removeLayer('unclustered-point');
                }
                if (this._mapGl.getLayer('clusters')) {
                    this._mapGl.removeLayer('clusters');
                }
                if (this._mapGl.getLayer('cluster-count')) {
                    this._mapGl.removeLayer('cluster-count');
                }
                console.log('remove source');
                this._mapGl.removeSource('mapPoints');
            }

            this._mapGl.addSource('mapPoints', {
                'type': 'geojson',
                'cluster': true,
                'clusterMaxZoom': 40, // Max zoom to cluster points on
                'clusterRadius': 50,
                'data': this._pointsMap
            });

            if (!this._mapGl.getLayer('unclustered-point')) {
                this._mapGl.addLayer({
                    id: 'unclustered-point',
                    type: 'circle',
                    source: 'mapPoints',
                    filter: ['!', ['has', 'point_count']],
                    paint: {
                        'circle-color': '#11b4da',
                        'circle-radius': 4,
                        'circle-stroke-width': 1,
                        'circle-stroke-color': '#fff'
                    }
                });

                this._mapGl.setLayoutProperty('unclustered-point', 'visibility', 'none');
            }

            if (!this._mapGl.getLayer('clusters')) {
                this._mapGl.addLayer({
                    id: 'clusters',
                    type: 'circle',
                    source: 'mapPoints',
                    filter: ['has', 'point_count'],
                    paint: {
                        'circle-color': [
                            'step',
                            ['get', 'point_count'],
                            '#51bbd6',
                            100,
                            '#f1f075',
                            750,
                            '#f28cb1'
                        ],
                        'circle-radius': [
                            'step',
                            ['get', 'point_count'],
                            20,
                            100,
                            30,
                            750,
                            40
                        ]
                    }
                });

                this._mapGl.setLayoutProperty('clusters', 'visibility', 'none');
            }

            if (!this._mapGl.getLayer('cluster-count')) {
                this._mapGl.addLayer({
                    id: 'cluster-count',
                    type: 'symbol',
                    source: 'mapPoints',
                    filter: ['has', 'point_count'],
                    layout: {
                        'text-field': ['get', 'point_count_abbreviated'],
                        'text-font': ['Open Sans Bold'],
                        'text-size': 12
                    }
                });
            }

            this._mapGl.on('click', 'unclustered-point', (e) => {
                if (e && e.features && e.features.length > 0 && e.features[0].properties && e.lngLat) {
                    const coordinates = e.lngLat;

                    while (Math.abs(e.lngLat.lng - coordinates.lng) > 180) {
                        coordinates.lng += e.lngLat.lng > coordinates.lng ? 360 : -360;
                    }

                    let marker: OrMapMarkerAsset = new OrMapMarkerAsset();
                    marker.asset = JSON.parse(e.features[0].properties.asset);

                    this._mapContainer.dispatchEvent(new OrMapMarkerClickedEvent(marker));
                }
            });

            this._mapGl.on('zoom', () => {
                if (this.popup && this.popup.isOpen()) {
                    this.popup.remove();
                    this.popupClusterId = undefined;
                }
            });

            this._mapGl.on('load', (e) => {
                console.log('load...');
                console.log(e);
                this._mapContainer.dispatchEvent(new OrMapSourceLoadedEvent());
            });

            this._mapGl.on('data', (e) => {
                console.log('data...');
                console.log(e);
                this._mapContainer.dispatchEvent(new OrMapSourceLoadedEvent());
            });

            if (this._mapGl) {
                this.getCurrentView();
            }
        }
    }

    public addMark(assetId: string, assetName: string, assetType: string, long: number, lat: number, asset: Asset) {
        this._assetTypesColors[assetType] = getMarkerIconAndColorFromAssetType(assetType)?.color;

        this._pointsMap.features.push({
            type: 'Feature',
            properties: {
                name: assetName,
                id: assetId,
                assetType: assetType,
                asset: asset
            },
            geometry: {
                type: "Point",
                coordinates: [ long, lat ]
            }
        });
    }

    public cleanupMark(): void {
        this._pointsMap = {
            type: "FeatureCollection",
            features: []
        };

        this._assetTypesColors = {};
    }

    public removeMarker(marker: OrMapMarker) {
        this._removeMarkerRadius(marker);
        this._updateMarkerElement(marker, false);
    }

    public onMarkerChanged(marker: OrMapMarker, prop: string) {
        if (!this._loaded) {
            return;
        }

        switch (prop) {
            case "lat":
            case "lng":
            case "radius":
                if (marker.hasPosition()) {
                    if (marker._actualMarkerElement) {
                        this._updateMarkerPosition(marker);
                    } else {
                        this._updateMarkerElement(marker, true);
                    }
                } else if (marker._actualMarkerElement) {
                    this._updateMarkerElement(marker, false);
                }
                break;
        }
    }

    protected _updateMarkerPosition(marker: OrMapMarker) {
        switch (this._type) {
            case MapType.RASTER:
                const m: L.Marker | undefined = this._markersJs.get(marker);
                if (m) {
                    m.setLatLng([marker.lat!, marker.lng!]);
                }
                break;
            case MapType.VECTOR:
                const mGl: MarkerGL | undefined = this._markersGl.get(marker);
                if (mGl) {
                    mGl.setLngLat([marker.lng!, marker.lat!]);
                }
                break;
        }
        this._createMarkerRadius(marker);
    }

    protected _updateMarkerElement(marker: OrMapMarker, doAdd: boolean) {

        switch (this._type) {
            case MapType.RASTER:
                let m = this._markersJs.get(marker);
                if (m) {
                    this._removeMarkerClickHandler(marker, marker.markerContainer as HTMLElement);
                    marker._actualMarkerElement = undefined;
                    (m as any).removeFrom(this._mapJs!);
                    this._markersJs.delete(marker);
                }

                if (doAdd) {
                    const elem = marker._createMarkerElement();
                    if (elem) {
                        const icon = L.divIcon({html: elem.outerHTML, className: "or-marker-raster"});
                        m = L.marker([marker.lat!, marker.lng!], {icon: icon, clickable: marker.interactive});
                        m.addTo(this._mapJs!);
                        marker._actualMarkerElement = (m as any).getElement() ? (m as any).getElement().firstElementChild as HTMLDivElement : undefined;
                        if (marker.interactive) {
                            this._addMarkerClickHandler(marker, marker.markerContainer as HTMLElement);
                        }

                        this._markersJs.set(marker, m);
                    }
                    if(marker.radius) {
                        this._createMarkerRadius(marker);
                    }
                }

                break;
            case MapType.VECTOR:
                let mGl = this._markersGl.get(marker);
                if (mGl) {
                    marker._actualMarkerElement = undefined;
                    this._removeMarkerClickHandler(marker, mGl.getElement());
                    mGl.remove();
                    this._markersGl.delete(marker);
                }

                if (doAdd) {
                    const elem = marker._createMarkerElement();

                    if (elem) {
                        mGl = new MarkerGL({
                            element: elem,
                            anchor: "top-left"
                        })
                            .setLngLat([marker.lng!, marker.lat!])
                            .addTo(this._mapGl!);

                        this._markersGl.set(marker, mGl);

                        marker._actualMarkerElement = mGl.getElement() as HTMLDivElement;

                        if (marker.interactive) {
                            this._addMarkerClickHandler(marker, mGl.getElement());
                        }
                    }
                    if(marker.radius) {
                        this._createMarkerRadius(marker);
                    }
                }


                break;
        }
    }

    protected _removeMarkerRadius(marker:OrMapMarker){

        if(this._mapGl && this._loaded && marker.radius && marker.lat && marker.lng) {

            if (this._mapGl.getSource('circleData')) {
                this._mapGl.removeLayer('marker-radius-circle');
                this._mapGl.removeSource('circleData');
            }
        }

    }

    protected _createMarkerRadius(marker:OrMapMarker){
        if(this._mapGl && this._loaded && marker.radius && marker.lat && marker.lng){

            this._removeMarkerRadius(marker);

            this._mapGl.addSource('circleData', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: "Feature",
                        geometry: {
                            "type": "Point",
                            "coordinates": [marker.lng, marker.lat]
                        },
                        properties: {
                            "title": "You Found Me",
                        }
                    }]
                }
            });

            this._mapGl.addLayer({
                "id": "marker-radius-circle",
                "type": "circle",
                "source": "circleData",
                "paint": {
                    "circle-radius": {
                        stops: [
                            [0, 0],
                            [20, metersToPixelsAtMaxZoom(marker.radius, marker.lat)]
                        ],
                        base: 2
                    },
                    "circle-color": "red",
                    "circle-opacity": 0.3
                }
            });
        }
    }

    public createBoundaryBox(boundsArray: string[] = []){
        if(this._mapGl && this._loaded && this._showBoundaryBox && this._viewSettings?.bounds){

            if (this._mapGl.getSource('bounds')) {
                this._mapGl.removeLayer('bounds');
                this._mapGl.removeSource('bounds');
            }

            if (boundsArray.length !== 4){
                boundsArray = this._viewSettings?.bounds.toString().split(",")
            }
            var req = [
                [
                    [boundsArray[0], boundsArray[3]],
                    [boundsArray[2], boundsArray[3]],
                    [boundsArray[2], boundsArray[1]],
                    [boundsArray[0], boundsArray[1]],
                    [boundsArray[0], boundsArray[3]]
                ]
            ]
            this._mapGl.fitBounds([
                parseFloat(boundsArray[0]) + .01,
                parseFloat(boundsArray[1]) - .01,
                parseFloat(boundsArray[2]) - .01,
                parseFloat(boundsArray[3]) + .01,
            ])
            this._mapGl.addSource('bounds', {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                        'type': 'Polygon',
                        // @ts-ignore
                        'coordinates': req
                    }
                }
            });

            this._mapGl.addLayer({
                'id': 'bounds',
                'type': 'fill',
                'source': 'bounds',
                'paint': {
                    'fill-color': '#FF0000',
                    'fill-opacity': .4
                }
            });
        }
    }

    protected _addMarkerClickHandler(marker: OrMapMarker, elem: HTMLElement) {
        if (elem) {
            const handler = (ev: MouseEvent) => {
                ev.stopPropagation();
                marker._onClick(ev);
            };
            this._clickHandlers.set(marker, handler);
            elem.addEventListener("click", handler);
        }
    }

    protected _removeMarkerClickHandler(marker: OrMapMarker, elem: HTMLElement) {
        const handler = this._clickHandlers.get(marker);
        if (handler && elem) {
            elem.removeEventListener("click", handler);
            this._clickHandlers.delete(marker);
        }
    }

    protected async _forwardGeocode(config: any) {
        const features = [];
        try {
            let request =  this._viewSettings!.geocodeUrl + '/search?q=' + config.query + '&format=geojson&polygon_geojson=1&addressdetails=1';
            const response = await fetch(request);
            const geojson = await response.json();
            for (let feature of geojson.features) {
                let center = [feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2, feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2 ];
                let point = {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: center
                    },
                    place_name: feature.properties.display_name,
                    properties: feature.properties,
                    text: feature.properties.display_name,
                    place_type: ['place'],
                    center: center
                };
                features.push(point);
            }
        } catch (e) {
            console.error(`Failed to forwardGeocode with error: ${e}`);
        }

        return {
            features: features
        };
    }

    protected async _reverseGeocode(config: any) {

    }

    protected _initLongPressEvent() {
        if (this._mapGl) {
            let pressTimeout: NodeJS.Timeout | null; 
            let pos: LngLat;
            let clearTimeoutFunc = () => { if (pressTimeout) clearTimeout(pressTimeout); pressTimeout = null; };

            this._mapGl.on('touchstart', (e) => {
                if (e.originalEvent.touches.length > 1) {
                    return;
                }
                pos = e.lngLat;
                pressTimeout = setTimeout(() => {
                    this._onLongPress(pos!);
                }, 500);
            });

            this._mapGl.on('mousedown', (e) => {
                if (!pressTimeout) {
                    pos = e.lngLat;
                    pressTimeout = setTimeout(() => {
                        this._onLongPress(pos!);
                        pressTimeout = null;
                    }, 500);
                }
            });
           
            this._mapGl.on('dragstart', clearTimeoutFunc);
            this._mapGl.on('mouseup', clearTimeoutFunc);
            this._mapGl.on('touchend', clearTimeoutFunc);
            this._mapGl.on('touchcancel', clearTimeoutFunc);
            this._mapGl.on('touchmove', clearTimeoutFunc);
            this._mapGl.on('moveend', clearTimeoutFunc);
            this._mapGl.on('gesturestart', clearTimeoutFunc);
            this._mapGl.on('gesturechange', clearTimeoutFunc);
            this._mapGl.on('gestureend', clearTimeoutFunc);
        }
    };
    protected _onLongPress(lngLat: LngLat) {
        this._mapContainer.dispatchEvent(new OrMapLongPressEvent(lngLat));
    }
    protected _onGeocodeChange(geocode:any) {
        this._mapContainer.dispatchEvent(new OrMapGeocoderChangeEvent(geocode));
    }
}
