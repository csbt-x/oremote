#!/bin/bash
# -----------------------------------------------------------------------------------------------------
# Script for cleaning up an or deployment; by default it deletes the or_postgresql-data volume
# -----------------------------------------------------------------------------------------------------
echo "Deleting existing postgres data volume"
docker volume rm or_postgresql-data 2> /dev/null