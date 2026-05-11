#!/bin/bash
# Run this once in your terminal to deploy Firestore security rules.
# It will open a browser for Google sign-in.
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd "$(dirname "$0")"
firebase login
firebase deploy --only firestore:rules --project mtgdraftforge
echo "✅ Security rules deployed."
