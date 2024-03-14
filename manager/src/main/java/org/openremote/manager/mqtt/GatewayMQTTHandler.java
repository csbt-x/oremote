/*
 * Copyright 2021, OpenRemote Inc.
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
package org.openremote.manager.mqtt;

import io.netty.buffer.ByteBuf;
import io.netty.handler.codec.mqtt.MqttQoS;
import jakarta.validation.ConstraintViolationException;
import org.apache.activemq.artemis.spi.core.protocol.RemotingConnection;
import org.keycloak.KeycloakSecurityContext;
import org.openremote.container.timer.TimerService;
import org.openremote.container.util.UniqueIdentifierGenerator;
import org.openremote.manager.asset.AssetProcessingService;
import org.openremote.manager.asset.AssetStorageService;
import org.openremote.manager.security.ManagerIdentityService;
import org.openremote.manager.security.ManagerKeycloakIdentityProvider;
import org.openremote.model.Container;
import org.openremote.model.asset.Asset;
import org.openremote.model.asset.agent.ConnectionStatus;
import org.openremote.model.asset.impl.GatewayAsset;
import org.openremote.model.asset.impl.GatewayV2Asset;
import org.openremote.model.attribute.AttributeEvent;
import org.openremote.model.mqtt.ErrorResponseMessage;
import org.openremote.model.mqtt.SuccessResponseMessage;
import org.openremote.model.query.AssetQuery;
import org.openremote.model.syslog.SyslogCategory;
import org.openremote.model.util.TextUtil;
import org.openremote.model.util.ValueUtil;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Consumer;
import java.util.logging.Logger;
import java.util.regex.Pattern;

import static org.openremote.manager.mqtt.Topic.SINGLE_LEVEL_TOKEN;
import static org.openremote.manager.mqtt.UserAssetProvisioningMQTTHandler.UNIQUE_ID_PLACEHOLDER;
import static org.openremote.model.Constants.ASSET_ID_REGEXP;
import static org.openremote.model.syslog.SyslogCategory.API;

public class GatewayMQTTHandler extends MQTTHandler {

    // main topics
    public static final String EVENTS_TOPIC = "events"; // prefix for event topics, users subscribe to these
    public static final String OPERATIONS_TOPIC = "operations"; // prefix for operation topics, users publish to these (or subscribe to responses)

    // sub-topics
    public static final String PROVISION_TOPIC = "provision";
    public static final String ASSETS_TOPIC = "assets";
    public static final String ATTRIBUTES_TOPIC = "attributes";

    // operation topics
    public static final String CREATE_TOPIC = "create";
    public static final String READ_TOPIC = "read";
    public static final String UPDATE_TOPIC = "update";
    public static final String DELETE_TOPIC = "delete";
    public static final String RESPONSE_TOPIC = "response"; // response suffix, responses will be published to this topic

    // token indexes
    public static final int REALM_TOKEN_INDEX = 0;
    public static final int CLIENT_ID_TOKEN_INDEX = 1;
    public static final int OPERATIONS_TOKEN_INDEX = 2;
    public static final int EVENTS_TOKEN_INDEX = 2;
    public static final int ASSET_ID_TOKEN_INDEX = 4;
    public static final int ATTRIBUTE_NAME_TOKEN_INDEX = 6;

    protected static final Logger LOG = SyslogCategory.getLogger(API, GatewayMQTTHandler.class);
    protected AssetProcessingService assetProcessingService;
    protected TimerService timerService;
    protected AssetStorageService assetStorageService;
    protected ManagerKeycloakIdentityProvider identityProvider;
    protected boolean isKeycloak;

    // publish topic - handler map
    protected HashMap<String, Consumer<PublishHandlerData>> topicHandlers = new HashMap<>();

    @Override
    public void start(Container container) throws Exception {
        super.start(container);
        timerService = container.getService(TimerService.class);
        assetStorageService = container.getService(AssetStorageService.class);
        assetProcessingService = container.getService(AssetProcessingService.class);
        ManagerIdentityService identityService = container.getService(ManagerIdentityService.class);

        if (!identityService.isKeycloakEnabled()) {
            LOG.warning("MQTT connections are not supported when not using Keycloak identity provider");
            isKeycloak = false;
        } else {
            isKeycloak = true;
            identityProvider = (ManagerKeycloakIdentityProvider) identityService.getIdentityProvider();
        }
    }

    @Override
    public void init(Container container) throws Exception {
        super.init(container);
        registerPublishTopicHandlers();
    }

    @Override
    public void onConnect(RemotingConnection connection) {
        super.onConnect(connection);
        LOG.fine("New MQTT connection session " + MQTTBrokerService.connectionToString(connection));

        if (isGatewayConnection(connection)) {
            updateLinkedGatewayStatus(connection, ConnectionStatus.CONNECTED);
        }

    }

    @Override
    public boolean handlesTopic(Topic topic) {
        return topicMatches(topic);
    }

    @Override
    public boolean topicMatches(Topic topic) {
        if (isEventsTopic(topic)) {
            return true;
        }
        return isOperationsTopic(topic);
    }

    @Override
    protected Logger getLogger() {
        return LOG;
    }

    @Override
    public boolean canSubscribe(RemotingConnection connection, KeycloakSecurityContext securityContext, Topic topic) {
        if (!isKeycloak) {
            LOG.fine("Identity provider is not keycloak");
            return false;
        }

        // only events and operation response topics are allowed for subscriptions
        if (!isEventsTopic(topic)) {
            // check if the topic is a request-response operation topic
            if (isOperationsTopic(topic) && isResponseTopic(topic)) {
                var topicWithoutResponseSuffix = Topic.parse(topic.toString().replace("/" + RESPONSE_TOPIC, ""));
                if (getHandlerFromTopic(topicWithoutResponseSuffix).isPresent()) {
                    return true;
                }
            }

            LOG.finest("Invalid topic " + topic + " for subscribing" + OPERATIONS_TOPIC);
            return false;
        }

        //TODO: Check if the events topic exists and is allowed for the user

        //TODO: Authorization and implement
        return true;
    }

    @Override
    public void onSubscribe(RemotingConnection connection, Topic topic) {
        // TODO:: Implement
        LOG.fine("Subscribed to topic " + topic);
    }

    @Override
    public void onUnsubscribe(RemotingConnection connection, Topic topic) {
        // TODO: Implement
    }

    @Override
    public Set<String> getPublishListenerTopics() {
        return topicHandlers.keySet();
    }

    // registers the handlers for the publish (operations) topics. Uses a map for the topic - handler consumer
    protected void registerPublishTopicHandlers() {

        // [realm/clientId/operations/assets/+] - common prefix for all operations
        var prefix = SINGLE_LEVEL_TOKEN + "/" + SINGLE_LEVEL_TOKEN + "/" + OPERATIONS_TOPIC + "/" + ASSETS_TOPIC + "/" + SINGLE_LEVEL_TOKEN + "/";

        // topic: realm/clientId/operations/assets/+/create
        topicHandlers.put(prefix + CREATE_TOPIC, this::handleCreateAssetRequest);

        // topic: realm/clientId/operations/assets/+/attributes/+/update
        topicHandlers.put(prefix + ATTRIBUTES_TOPIC + "/" + SINGLE_LEVEL_TOKEN + "/" + UPDATE_TOPIC, this::handleSingleLineAttributeUpdateRequest);

        // topic: realm/clientId/operations/assets/+/attributes/update
        topicHandlers.put(prefix + ATTRIBUTES_TOPIC + "/" + UPDATE_TOPIC, this::handleMultiLineAttributeUpdateRequest);

        topicHandlers.forEach((topic, handler) -> {
            LOG.fine("Registered handler for topic " + topic);
        });
    }


    @Override
    public boolean canPublish(RemotingConnection connection, KeycloakSecurityContext securityContext, Topic topic) {
        if (!isKeycloak) {
            LOG.fine("Identity provider is not keycloak");
            return false;
        }

        if (!isOperationsTopic(topic)) {
            LOG.finest("Invalid topic " + topic + " for publishing" + OPERATIONS_TOPIC);
            return false;
        }

        //TODO: Authorization

        if (getHandlerFromTopic(topic).isEmpty()) {
            LOG.fine("No handler found for topic " + topic);
            return false;
        }

        return true;
    }

    @Override
    public void onPublish(RemotingConnection connection, Topic topic, ByteBuf body) {
        // TODO: Authorization

        // we check whether we have a handler for the topic, if not we don't process it
        var handler = getHandlerFromTopic(topic);
        if (handler.isPresent()) {
            handler.get().accept(new PublishHandlerData(connection, topic, body));
        } else {
            LOG.fine("No handler found for topic " + topic);
        }
    }

    @Override
    public void onConnectionLost(RemotingConnection connection) {
        if (isGatewayConnection(connection)) {
            updateLinkedGatewayStatus(connection, ConnectionStatus.DISCONNECTED);
        }
    }

    @Override
    public void onDisconnect(RemotingConnection connection) {
        if (isGatewayConnection(connection)) {
            updateLinkedGatewayStatus(connection, ConnectionStatus.DISCONNECTED);
        }

    }

    private void handleCreateAssetRequest(PublishHandlerData handlerData) {
        String payloadContent = handlerData.body.toString(StandardCharsets.UTF_8);
        String realm = topicTokenIndexToString(handlerData.topic, REALM_TOKEN_INDEX);

        if (TextUtil.isNullOrEmpty(payloadContent)) {
            publishErrorResponse(handlerData.topic, ErrorResponseMessage.Error.MESSAGE_EMPTY);
            return;
        }

        // TODO: Authorization

        // Replace any placeholders in the template
        String assetTemplate = payloadContent;
        assetTemplate = assetTemplate.replaceAll(UNIQUE_ID_PLACEHOLDER, UniqueIdentifierGenerator.generateId());

        var optionalAsset = ValueUtil.parse(assetTemplate, Asset.class);

        if (optionalAsset.isEmpty()) {
            LOG.fine("Invalid asset template " + payloadContent + " in create asset request " + handlerData.connection.getClientID());
            publishErrorResponse(handlerData.topic, ErrorResponseMessage.Error.MESSAGE_INVALID);
            return;
        }

        Asset<?> asset = optionalAsset.get();
        asset.setId(UniqueIdentifierGenerator.generateId());
        asset.setRealm(realm);

        try {
            assetStorageService.merge(asset);
        } catch (ConstraintViolationException e) {
            publishErrorResponse(handlerData.topic, ErrorResponseMessage.Error.MESSAGE_INVALID);
            LOG.fine("Failed to create asset " + asset + " in realm " + realm + " " + handlerData.connection.getClientID());
            return;
        } catch (Exception e) {
            publishErrorResponse(handlerData.topic, ErrorResponseMessage.Error.SERVER_ERROR);
            LOG.warning("Failed to create asset " + asset + " in realm " + realm + " " + handlerData.connection.getClientID());
            return;
        }

        // send success response
        mqttBrokerService.publishMessage(getResponseTopic(handlerData.topic),
                new SuccessResponseMessage(SuccessResponseMessage.Success.CREATED, realm, asset), MqttQoS.AT_MOST_ONCE
        );
    }


    protected void handleSingleLineAttributeUpdateRequest(PublishHandlerData handlerData) {
        String realm = topicTokenIndexToString(handlerData.topic, REALM_TOKEN_INDEX);
        String assetId = topicTokenIndexToString(handlerData.topic, ASSET_ID_TOKEN_INDEX);
        String attributeName = topicTokenIndexToString(handlerData.topic, ATTRIBUTE_NAME_TOKEN_INDEX);
        String payloadContent = handlerData.body.toString(StandardCharsets.UTF_8);

        if (!Pattern.matches(ASSET_ID_REGEXP, assetId)) {
            LOG.info("Received invalid asset ID " + assetId + " in single-line attribute update request " + handlerData.connection.getClientID());
            return;
        }
    }

    protected void handleMultiLineAttributeUpdateRequest(PublishHandlerData handlerData) {
        String realm = topicTokenIndexToString(handlerData.topic, REALM_TOKEN_INDEX);
        String assetId = topicTokenIndexToString(handlerData.topic, ASSET_ID_TOKEN_INDEX);
        String attributeName = topicTokenIndexToString(handlerData.topic, ATTRIBUTE_NAME_TOKEN_INDEX);
        String payloadContent = handlerData.body.toString(StandardCharsets.UTF_8);

        if (!Pattern.matches(ASSET_ID_REGEXP, assetId)) {
            LOG.info("Received invalid asset ID " + assetId + " in multi-line attribute update request " + handlerData.connection.getClientID());
            return;
        }

    }

    protected void sendAttributeEvent(AttributeEvent event) {
        assetProcessingService.sendAttributeEvent(event, GatewayMQTTHandler.class.getName());
    }

    protected void updateLinkedGatewayStatus(RemotingConnection connection, ConnectionStatus status) {
        GatewayV2Asset gatewayAsset = (GatewayV2Asset) assetStorageService.find(new AssetQuery()
                .types(GatewayV2Asset.class).attributeValue(GatewayV2Asset.CLIENT_ID.getName(), connection.getClientID()));

        if (gatewayAsset != null) {
            LOG.fine("Linked Gateway asset found for MQTT client, updating connection status to " + status);
            sendAttributeEvent(new AttributeEvent(gatewayAsset.getId(), GatewayAsset.STATUS, status));
        }
    }

    protected boolean isOperationsTopic(Topic topic) {
        return Objects.equals(topicTokenIndexToString(topic, OPERATIONS_TOKEN_INDEX), OPERATIONS_TOPIC);
    }

    protected boolean isResponseTopic(Topic topic) {
        // always a suffix
        return Objects.equals(topicTokenIndexToString(topic, topic.getTokens().size() - 1), RESPONSE_TOPIC);
    }

    protected boolean isEventsTopic(Topic topic) {
        return Objects.equals(topicTokenIndexToString(topic, EVENTS_TOKEN_INDEX), EVENTS_TOPIC);
    }

    protected boolean isGatewayConnection(RemotingConnection connection) {
        return assetStorageService.find(new AssetQuery().types(GatewayV2Asset.class)
                .attributeValue(GatewayV2Asset.CLIENT_ID.getName(), connection.getClientID())) != null;
    }

    protected String getResponseTopic(Topic topic) {
        return topic.toString() + "/" + RESPONSE_TOPIC;
    }

    // returns the handler for the given topic - if any
    protected Optional<Consumer<PublishHandlerData>> getHandlerFromTopic(Topic topic) {
        Consumer<PublishHandlerData> matchedHandler = null;
        for (Map.Entry<String, Consumer<PublishHandlerData>> entry : topicHandlers.entrySet()) {
            String topicPattern = entry.getKey();
            Consumer<PublishHandlerData> handler = entry.getValue();

            // Translate MQTT topic patterns with wildcards (+ and #) into regular expressions
            if (topic.toString().matches(topicPattern.replace("+", "[^/]+").replace("#", ".*"))) {
                matchedHandler = handler;
                break;
            }
        }
        return Optional.ofNullable(matchedHandler);
    }

    protected void publishErrorResponse(Topic topic, ErrorResponseMessage.Error error) {
        mqttBrokerService.publishMessage(getResponseTopic(topic), new ErrorResponseMessage(error), MqttQoS.AT_MOST_ONCE);
    }

    // wraps the con, top, body into a record object for consumer usage
    protected record PublishHandlerData(RemotingConnection connection, Topic topic, ByteBuf body) {
    }


}

