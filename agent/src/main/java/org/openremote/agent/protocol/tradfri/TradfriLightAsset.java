package org.openremote.agent.protocol.tradfri;

import org.openremote.agent.protocol.ProtocolAssetService;
import org.openremote.agent.protocol.tradfri.device.Light;
import org.openremote.agent.protocol.tradfri.device.event.*;
import org.openremote.model.asset.Asset;
import org.openremote.model.asset.AssetAttribute;
import org.openremote.model.asset.AssetType;
import org.openremote.model.attribute.MetaItem;
import org.openremote.model.value.Values;

import java.util.Optional;

import static org.openremote.model.attribute.AttributeValueType.NUMBER;
import static org.openremote.model.attribute.MetaItemType.*;

public class TradfriLightAsset extends TradfriAsset {

    /**
     * The agent link.
     */
    private final MetaItem agentLink;

    /**
     * Construct the TradfriLightAsset class.
     * @param parentId parent id.
     * @param agentLink the agent link.
     * @param light the light.
     * @param assetService the asset service.
     */
    public TradfriLightAsset(String parentId, MetaItem agentLink, Light light, ProtocolAssetService assetService) {
        super(parentId, light, AssetType.LIGHT, assetService);
        this.agentLink = agentLink;
    }

    /**
     * Method to create the asset attributes
     */
    @Override
    public void createAssetAttributes() {
        Optional<AssetAttribute> lightDimLevel = getAttribute("lightDimLevel");
        if (lightDimLevel.isPresent()) {
            lightDimLevel.get().setType(NUMBER);
            lightDimLevel.get().setMeta(
                    new MetaItem(RANGE_MIN, Values.create(0)),
                    new MetaItem(RANGE_MAX, Values.create(254)),
                    new MetaItem(LABEL, Values.create("Brightness (0 - 254)")),
                    new MetaItem(DESCRIPTION, Values.create("The brightness of the TRÅDFRI light (Only for dimmable lights)")),
                    new MetaItem(ACCESS_RESTRICTED_READ, Values.create(true)),
                    new MetaItem(ACCESS_RESTRICTED_WRITE, Values.create(true)),
                    agentLink
            );
        }
        Optional<AssetAttribute> lightStatus = getAttribute("lightStatus");
        lightStatus.ifPresent(assetAttribute -> assetAttribute.setMeta(
                new MetaItem(LABEL, Values.create("State (on/off)")),
                new MetaItem(DESCRIPTION, Values.create("The state of the TRÅDFRI light (Checked means on, unchecked means off)")),
                new MetaItem(ACCESS_RESTRICTED_READ, Values.create(true)),
                new MetaItem(ACCESS_RESTRICTED_WRITE, Values.create(true)),
                agentLink
        ));
        Optional<AssetAttribute> colorGBW = getAttribute("colorGBW");
        colorGBW.ifPresent(assetAttribute -> assetAttribute.setMeta(
                new MetaItem(LABEL, Values.create("Color")),
                new MetaItem(DESCRIPTION, Values.create("The color of the TRÅDFRI light (Only for RGB lights)")),
                new MetaItem(ACCESS_RESTRICTED_READ, Values.create(true)),
                new MetaItem(ACCESS_RESTRICTED_WRITE, Values.create(true)),
                agentLink
        ));
        AssetAttribute colorTemperature = new AssetAttribute("colorTemperature", NUMBER, Values.create(0));
        colorTemperature.setMeta(
                new MetaItem(RANGE_MIN, Values.create(250)),
                new MetaItem(RANGE_MAX, Values.create(454)),
                new MetaItem(LABEL, Values.create("Color temperature")),
                new MetaItem(DESCRIPTION, Values.create("The color temperature of the TRÅDFRI light (Only for white spectrum lights)")),
                new MetaItem(ACCESS_RESTRICTED_READ, Values.create(true)),
                new MetaItem(ACCESS_RESTRICTED_WRITE, Values.create(true)),
                agentLink
        );
        addAttributes(colorTemperature);
    }

    /**
     * Method to create the event handlers
     */
    @Override
    public void createEventHandlers() {
        Asset asset = this;
        EventHandler<LightChangeOnEvent> lightOnOffEventHandler = new EventHandler<LightChangeOnEvent>() {
            @Override
            public void handle(LightChangeOnEvent event) {
                Optional<AssetAttribute> lightStatus = getAttribute("lightStatus");
                lightStatus.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getOn())));
                assetService.mergeAsset(asset);
            }
        };

        EventHandler<LightChangeBrightnessEvent> lightBrightnessEventHandler = new EventHandler<LightChangeBrightnessEvent>() {
            @Override
            public void handle(LightChangeBrightnessEvent event) {
                Optional<AssetAttribute> lightDimLevel = getAttribute("lightDimLevel");
                lightDimLevel.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getBrightness())));
                assetService.mergeAsset(asset);
            }
        };

        EventHandler<LightChangeColourEvent> lightColourChangeEventHandler = new EventHandler<LightChangeColourEvent>() {
            @Override
            public void handle(LightChangeColourEvent event) {
                Optional<AssetAttribute> colorGBW = getAttribute("colorGBW");
                colorGBW.ifPresent(assetAttribute -> assetAttribute.setValue(Values.createObject().put("red", device.toLight().getColourRGB().getRed()).put("green", device.toLight().getColourRGB().getGreen()).put("blue", device.toLight().getColourRGB().getBlue())));
                assetService.mergeAsset(asset);
            }
        };

        EventHandler<LightChangeColourTemperatureEvent> lightColorTemperatureEventHandler = new EventHandler<LightChangeColourTemperatureEvent>() {
            @Override
            public void handle(LightChangeColourTemperatureEvent event) {
                Optional<AssetAttribute> colorTemperature = getAttribute("colorTemperature");
                colorTemperature.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getColourTemperature())));
                assetService.mergeAsset(asset);
            }
        };
        Light light = device.toLight();
        light.addEventHandler(lightOnOffEventHandler);
        light.addEventHandler(lightBrightnessEventHandler);
        light.addEventHandler(lightColourChangeEventHandler);
        light.addEventHandler(lightColorTemperatureEventHandler);
    }

    /**
     * Method to set the initial values
     */
    @Override
    public void setInitialValues() {
        Optional<AssetAttribute> lightStatus = getAttribute("lightStatus");
        lightStatus.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getOn())));
        Optional<AssetAttribute> lightDimLevel = getAttribute("lightDimLevel");
        lightDimLevel.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getBrightness())));
        Optional<AssetAttribute> colorGBW = getAttribute("colorGBW");
        colorGBW.ifPresent(assetAttribute -> assetAttribute.setValue(Values.createObject().put("red", device.toLight().getColourRGB().getRed()).put("green", device.toLight().getColourRGB().getGreen()).put("blue", device.toLight().getColourRGB().getBlue())));
        Optional<AssetAttribute> colorTemperature = getAttribute("colorTemperature");
        colorTemperature.ifPresent(assetAttribute -> assetAttribute.setValue(Values.create(device.toLight().getColourTemperature())));
    }
}
