/*
 * Copyright 2016, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.openremote.manager.client.assets.asset;

import com.google.gwt.core.client.Scheduler;
import com.google.gwt.place.shared.PlaceController;
import com.google.gwt.user.client.ui.AcceptsOneWidget;
import org.openremote.manager.client.assets.AssetMapper;
import org.openremote.manager.client.assets.AssetsDashboardPlace;
import org.openremote.manager.client.assets.browser.AssetBrowser;
import org.openremote.manager.client.assets.browser.AssetBrowsingActivity;
import org.openremote.manager.client.event.bus.EventBus;
import org.openremote.manager.client.event.bus.EventRegistration;
import org.openremote.manager.client.i18n.ManagerMessages;
import org.openremote.manager.client.interop.elemental.JsonObjectMapper;
import org.openremote.manager.client.service.RequestService;
import org.openremote.manager.shared.asset.Asset;
import org.openremote.manager.shared.asset.AssetResource;
import org.openremote.manager.shared.map.MapResource;

import javax.inject.Inject;
import java.util.Collection;
import java.util.logging.Logger;

import static org.openremote.manager.client.http.RequestExceptionHandler.handleRequestException;

public class AssetActivity
    extends AssetBrowsingActivity<AssetView, AssetPlace>
    implements AssetView.Presenter {

    private static final Logger LOG = Logger.getLogger(AssetActivity.class.getName());

    final PlaceController placeController;
    final MapResource mapResource;
    final JsonObjectMapper jsonObjectMapper;

    protected double[] selectedCoordinates;

    @Inject
    public AssetActivity(EventBus eventBus,
                         ManagerMessages managerMessages,
                         RequestService requestService,
                         PlaceController placeController,
                         AssetView view,
                         AssetBrowser.Presenter assetBrowserPresenter,
                         AssetResource assetResource,
                         AssetMapper assetMapper,
                         MapResource mapResource,
                         JsonObjectMapper jsonObjectMapper) {
        super(eventBus, managerMessages, requestService, view, assetBrowserPresenter, assetResource, assetMapper);
        this.placeController = placeController;
        this.mapResource = mapResource;
        this.jsonObjectMapper = jsonObjectMapper;
    }

    @Override
    public void start(AcceptsOneWidget container, EventBus eventBus, Collection<EventRegistration> registrations) {
        super.start(container, eventBus, registrations);

        if (!getView().isMapInitialised()) {
            requestService.execute(
                jsonObjectMapper,
                mapResource::getSettings,
                200,
                view::initialiseMap,
                ex -> handleRequestException(ex, eventBus, managerMessages)
            );
        }
    }

    @Override
    protected void startCreateAsset() {
        super.startCreateAsset();
        view.setFormBusy(true);
        asset = new Asset();
        asset.setName("My New Asset");
        view.enableCreate(true);
        view.enableUpdate(false);
        view.enableDelete(false);
        writeToView();
        view.setFormBusy(false);
    }

    @Override
    protected void onAssetLoaded() {
        writeToView();
        view.enableCreate(false);
        view.enableUpdate(true);
        view.enableDelete(true);
        view.setFormBusy(false);
        view.showFeaturesSelection(getFeature(asset));
        view.flyTo(asset.getCoordinates());
    }

    @Override
    protected void onAssetsDeselected() {
        view.hideFeaturesSelection();
        placeController.goTo(new AssetsDashboardPlace());
    }

    @Override
    protected void onAssetSelectionChange(String selectedAssetId) {
        placeController.goTo(new AssetPlace(selectedAssetId));
    }

    @Override
    protected void onBeforeAssetLoad() {
        view.setFormBusy(true);
    }

    @Override
    public void onMapClicked(double lng, double lat) {
        selectedCoordinates = new double[] {lng, lat};
        view.showPopup(lng, lat, managerMessages.selectedLocation());
    }

    @Override
    public void update() {

    }

    @Override
    public void create() {

    }

    @Override
    public void delete() {

    }

    protected void writeToView() {
        view.setName(asset.getName());
        view.setType(asset.getType());
        view.setCreatedOn(asset.getCreatedOn());
    }

    protected void readFromView() {
        asset.setName(view.getName());
        asset.setType(view.getType());
        if (selectedCoordinates != null) {
            asset.setCoordinates(selectedCoordinates);
        }
    }
}
