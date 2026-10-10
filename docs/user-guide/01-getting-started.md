# Getting started

Section: Getting Started
Roles: Admin, Manager, Staff
Permission: help.view
Screen: help
Guide: servos.core
Keywords: sign in, workspace, online, offline

## Overview

ServOS is a web workspace connected to your business API. Your available work areas depend on your staff permissions.

## Procedure

1. Open the ServOS PWA and sign in with your staff login and password.
2. Confirm your name and available workspaces.
3. Open Help for task guides or choose the workspace for your task.
4. Sign out before handing the browser to another person.

## First-time business setup

On a new business database, choose **Set up a new business** on the sign-in screen. Enter the one-time setup key supplied for that installation, the business name, administrator name and login, then create and confirm a password of at least 12 characters. The setup key is sent to the setup API and is not saved in browser storage.

After signing in, complete the guided business setup:

1. Enter the business category, contact details, receipt name and the VAT and levy rates confirmed by the owner. ServOS does not assume tax rates.
2. Choose the closest business type and rename the suggested outlet and storage location to match the premises.
3. Keep Cash enabled. Select other payment methods only when the business accepts them. For M-Pesa, enter the real Till or Paybill details supplied by the owner; ServOS records manual M-Pesa payments without implying a Daraja connection.
4. Review and save the business settings, outlets, storage and selected payment accounts, then finish setup.

Setup progress is held by the API, so a refresh or sign-out does not restart the wizard. Normal workspaces remain gated until the business settings, one active outlet, its storage location and Cash account are saved. Products, stock imports, staff and hotel rooms can be configured after this essential setup.

## What ServOS handles

The API checks the account, device and permission before accepting business commands.

## Common mistakes and correction

Do not assume that a draft or queued message is a completed transaction. Check Activity and recover an unknown command outcome before trying again.
