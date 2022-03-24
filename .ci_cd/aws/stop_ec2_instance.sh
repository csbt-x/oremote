#!/bin/bash

# Stop the EC2 instance with the specified name in the specified account
# Arguments:
# 1 - ACCOUNT_NAME name of the account that contains the instance
# 1 - INSTANCE_NAME name of the instance (host FQDN)

if [[ $BASH_SOURCE = */* ]]; then
 awsDir=${BASH_SOURCE%/*}/
else
  awsDir=./
fi

ACCOUNT_NAME=${1,,}
INSTANCE_NAME=${2,,}

source "${awsDir}login.sh"

ACCOUNT_PROFILE=
if [ -n "$ACCOUNT_NAME" ]; then
  # Update github-da profile with ARN for ACCOUNT_ID
  source "${awsDir}set_github-da_account_arn.sh"
  ACCOUNT_PROFILE="--profile github-da"
fi

echo "Attempting to stop EC2 instance with name '$INSTANCE_NAME'..."
instanceId=$(aws ec2 describe-instances --filters 'Name=tag:Name,Values=$INSTANCE_NAME' --output text --query 'Reservations[*].Instances[*].InstanceId' $ACCOUNT_PROFILE)
if [ -n "$instanceId" ]; then
  currentState=$(aws ec2 describe-instances --filters 'Name=tag:Name,Values=$INSTANCE_NAME' --output text --query 'Reservations[*].Instances[*].State.Name' $ACCOUNT_PROFILE)

  if [ "$currentState" == 'running' ]; then
    echo "Stopping EC2 instance"
    aws ec2 stop-instances --instance-ids $instanceId $ACCOUNT_PROFILE
  else
    echo "Current EC2 instance state is '$currentState' it must be in 'running' state to initiate stop"
    exit 1
  fi
else
  echo "No EC2 instance found (maybe the host is not an EC2 instance)"
  exit 1
fi
