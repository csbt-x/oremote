/*
 * Copyright 2017, OpenRemote Inc.
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
package org.openremote.model.alarm;

import org.hibernate.annotations.Formula;
import org.openremote.model.value.MetaItemType;

import javax.persistence.*;
import java.io.Serializable;
import java.util.Date;
import java.util.Objects;

/**
 * An asset can be linked to many users, and a user can have links to many assets.
 * <p>
 * If a user has linked assets, it's a <em>restricted</em> user. When a client authenticates
 * with such a user, the client can only access the assigned/linked assets of that user, and
 * the available operations are limited:
 * <ul>
 * <li>
 * When a restricted client reads assets, only dynamic attributes with
 * {@link MetaItemType#ACCESS_RESTRICTED_READ} are included.
 * A restricted client may submit a query for public assets and dynamic attributes with
 * {@link MetaItemType#ACCESS_PUBLIC_READ}.
 * </li>
 * <li>
 * When a restricted client updates existing assets, new attributes can be added, but
 * only attributes with {@link MetaItemType#ACCESS_RESTRICTED_WRITE} can be updated or deleted; note Access meta items
 * cannot be modified. Any new attributes are automatically set with {@link MetaItemType#ACCESS_RESTRICTED_READ} and
 * {@link MetaItemType#ACCESS_RESTRICTED_WRITE}, thus ensuring that a restricted client can fully access its own attributes.
 * </li>
 * <li>
 * A restricted client can not create or delete assets. A restricted client can not change the name, parent, or
 * realm of an asset. A restricted user can not make an asset public. A restricted user can change the location of an asset.
 * </li>
 * </ul>.
 */
@Entity
@Table(name = "ALARM_ASSET_LINK")
public class AlarmAssetLink {

    public static class Id implements Serializable {
        @Column(name = "REALM", length = 36)
        protected String realm;

        @Column(name = "ALARM_ID", length = 36)
        protected Long alarmId;

        @Column(name = "ASSET_ID", length = 22, columnDefinition = "char(22)")
        protected String assetId;

        protected Id() {
        }

        public Id(String realm, Long alarmId, String assetId) {
            this.realm = realm;
            this.alarmId = alarmId;
            this.assetId = assetId;
        }

        public String getRealm() {
            return realm;
        }

        public Long getAlarmId() {
            return alarmId;
        }

        public String getAssetId() {
            return assetId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;

            Id id = (Id) o;

            if (!realm.equals(id.realm)) return false;
            if (!alarmId.equals(id.alarmId)) return false;
            return assetId.equals(id.assetId);
        }

        @Override
        public int hashCode() {
            int result = realm.hashCode();
            result = 31 * result + alarmId.hashCode();
            result = 31 * result + assetId.hashCode();
            return result;
        }

        @Override
        public String toString() {
            return getClass().getSimpleName() + "{" +
                "realm='" + realm + '\'' +
                ", alarmId='" + alarmId + '\'' +
                ", assetId='" + assetId + '\'' +
                '}';
        }
    }

    @EmbeddedId
    protected Id id;

    @Temporal(TemporalType.TIMESTAMP)
    @Column(name = "CREATED_ON", updatable = false, nullable = false, columnDefinition = "TIMESTAMP WITH TIME ZONE")
    protected Date createdOn;

    @Formula("(select a.NAME from ASSET a where a.ID = ASSET_ID)")
    protected String assetName;

    @Formula("(select pa.NAME from ASSET a left outer join ASSET pa on a.PARENT_ID = pa.ID where a.ID = ASSET_ID)")
    protected String parentAssetName;

    @Formula("(select u.USERNAME || CASE WHEN COALESCE(NULLIF(u.FIRST_NAME, ''), NULLIF(u.LAST_NAME, '')) IS NULL THEN '' ELSE ' (' END || COALESCE(u.FIRST_NAME, '') || CASE WHEN NULLIF(u.FIRST_NAME, '') IS NOT NULL AND NULLIF(u.LAST_NAME, '') IS NOT NULL THEN ' ' ELSE '' END || COALESCE(u.LAST_NAME, '') || CASE WHEN COALESCE(NULLIF(u.FIRST_NAME, ''), NULLIF(u.LAST_NAME, '')) IS NULL THEN '' ELSE ')' END from PUBLIC.USER_ENTITY u where u.ID = USER_ID)")
    protected String userFullName;

    protected AlarmAssetLink() {
    }

    public AlarmAssetLink(Id id) {
        this.id = id;
    }

    public AlarmAssetLink(String realm, Long alarmId, String assetId) {
        this(new AlarmAssetLink.Id(realm, alarmId, assetId));
    }

    public Id getId() {
        return id;
    }

    public String getAssetName() {
        return assetName;
    }

    public String getParentAssetName() {
        return parentAssetName;
    }

    public String getUserFullName() {
        return userFullName;
    }

    public Date getCreatedOn() {
        return createdOn;
    }

    public void setCreatedOn(Date createdOn) {
        this.createdOn = createdOn;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        AlarmAssetLink that = (AlarmAssetLink) o;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
            "id=" + id +
            ", createdOn=" + createdOn +
            ", assetName='" + assetName + '\'' +
            ", parentAssetName='" + parentAssetName + '\'' +
            ", userFullName='" + userFullName + '\'' +
            '}';
    }
}
