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
package org.openremote.model.provisioning;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.openremote.model.http.RequestParams;

import javax.validation.Valid;
import jakarta.ws.rs.*;

import static jakarta.ws.rs.core.MediaType.APPLICATION_JSON;

@Tag(name = "Provisioning")
@Path("provisioning")
public interface ProvisioningResource {

    @GET
    @Produces(APPLICATION_JSON)
    ProvisioningConfig<?, ?>[] getProvisioningConfigs();

    @POST
    @Consumes(APPLICATION_JSON)
    @Produces(APPLICATION_JSON)
    long createProvisioningConfig(ProvisioningConfig<?, ?> provisioningConfig);

    @PUT
    @Path("{id}")
    @Consumes(APPLICATION_JSON)
    void updateProvisioningConfig(@BeanParam RequestParams requestParams, @PathParam("id") Long id, @Valid ProvisioningConfig<?, ?> provisioningConfig);

    @DELETE
    @Path("{id}")
    @Produces(APPLICATION_JSON)
    void deleteProvisioningConfig(@BeanParam RequestParams requestParams, @PathParam("id") Long id);
}
