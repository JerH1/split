/**
 * The English catalog, and the source of truth for the message shape.
 *
 * `Messages` is derived from this object, so every other catalog is checked
 * against it by tsc: a missing key, a stray key, or a plural where a plain
 * string belongs all fail `npm run build` rather than reaching a phone as a
 * blank label.
 *
 * Placeholders are `{name}`. A `{ one, other }` value is chosen by
 * Intl.PluralRules for the reader's locale — see translate() in ./translate.ts.
 */
export const en = {
  // --- App-wide -----------------------------------------------------------
  "app.tagline": "Everyone grabs what they ate.",
  "app.noSignUp": "no sign-up needed",
  "common.yourName": "Your name",
  "common.enterYourName": "Enter your name",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.remove": "Remove",
  "common.view": "View",
  "common.tryAgain": "Try Again",
  "common.checking": "Checking...",
  "common.uploading": "Uploading...",
  "common.host": "Host",
  "a11y.skipToContent": "Skip to content",
  "common.language": "Language",
  "common.chooseLanguage": "Choose a language",

  // --- Home ---------------------------------------------------------------
  "home.gotACode": "Got a code?",
  "home.optional": "optional",
  "home.billFound": "Bill found!",
  "home.noBillWithCode": "No bill with this code",
  "home.joining": "Joining...",
  "home.creating": "Creating...",
  "home.joinBill": "Join Bill",
  "home.startBill": "Start Bill",
  "home.failedToJoin": "Failed to join bill",
  "home.failedToCreate": "Failed to create bill",
  "home.recent": "Recent",
  "home.billNamed": "Bill {code}",

  // --- Session shell ------------------------------------------------------
  "session.loading": "Loading bill...",
  "session.notFoundTitle": "Bill Not Found",
  "session.notFoundBody":
    "Code “{code}” doesn't match any active bill. It might have expired or there's a typo.",
  "session.startANewBill": "Start a new bill",
  "session.backToHome": "Back to home",
  "session.copyCodeAria": "Bill code {digits}. Copy share link.",
  "session.copied": "Copied!",
  "session.tapToCopy": "tap to copy link",
  "session.linkCopied": "Share link copied to clipboard",
  "session.showQrCode": "Show QR code",
  "session.locked": "This bill is locked.",
  "session.lockedHost":
    "This bill is locked — unlock it from Totals to make changes.",

  // --- Join gate ----------------------------------------------------------
  "join.documentTitle": "Join bill {code}",
  "join.hostedBy": "Hosted by {name}",
  "join.title": "Join this bill",
  "join.body": "Enter your name to see items and claim your share.",
  "join.failed": "Failed to join bill",
  "join.toast": "{name} joined",

  // --- Tabs ---------------------------------------------------------------
  "tabs.aria": "Bill sections",
  "tabs.items": "Items",
  "tabs.taxTip": "Tax & Tip",
  "tabs.totals": "Totals",
  "tabs.unclaimedAria": {
    one: ", {count} unclaimed item",
    other: ", {count} unclaimed items",
  },

  // --- Items tab ----------------------------------------------------------
  "items.documentTitle": "Items",
  "items.documentTitleMerchant": "Items - {merchant}",
  "items.whosHere": "Who's Here ({count})",
  "items.hostTag": "host",
  "items.receipt": "Receipt",
  "items.receiptScanned":
    "Receipt scanned. Scanning another replaces every item.",
  "items.onlyHostCanScan": "Only the host can scan a receipt for this bill.",
  "items.analyzing": "Analyzing receipt...",
  "items.extracting": "Extracting items with AI",
  "items.somethingWentWrong": "Something went wrong",
  "items.heading": "Items",
  "items.headingCount": "Items ({count})",
  "items.upForGrabs": "{count} up for grabs",
  "items.addItem": "+ Add Item",
  "items.total": "Items Total",

  // Receipt rejection reasons, as title + hint pairs.
  "receipt.rejectLandscapeTitle": "This doesn't look like a receipt",
  "receipt.rejectLandscapeHint": "Try taking a photo of your receipt instead",
  "receipt.rejectDocumentTitle": "This looks like a document, not a receipt",
  "receipt.rejectDocumentHint":
    "Make sure you're photographing a store receipt",
  "receipt.rejectBlurryTitle": "The image is too blurry",
  "receipt.rejectBlurryHint": "Try taking another photo with better lighting",
  "receipt.rejectOtherTitle": "We couldn't recognize this as a receipt",
  "receipt.rejectOtherHint": "Try taking a clearer photo of your receipt",
  "receipt.notConfiguredTitle": "Receipt scanning isn't set up",
  "receipt.notConfiguredHint":
    "This deployment has no Anthropic API key. Add the items by hand for now.",
  "receipt.unreadableTitle": "We couldn't read that receipt",
  "receipt.unreadableHint": "Try another photo, or add the items by hand.",
  "receipt.threwTitle": "Something went wrong reading that receipt",
  "receipt.threwHint": "Try again, or add the items by hand.",

  // --- Receipt capture / viewer -------------------------------------------
  "capture.takePhoto": "Take Photo",
  "capture.chooseImage": "Choose Image",
  "capture.uploadFailed":
    "We couldn't upload that image. Check your connection and try again.",
  "viewer.dialogAria": "Original receipt",
  "viewer.closeAria": "Close receipt",
  "viewer.loading": "Loading image...",
  "viewer.notFound": "Image not found",
  "viewer.imageAlt": "Original receipt for this bill",

  // --- Receipt balance ----------------------------------------------------
  "balance.missingTitle": "{amount} of this receipt isn't accounted for",
  "balance.extraTitle": "Items add up to {amount} more than the receipt",
  "balance.body":
    "Receipt total {receiptTotal}, but items and fees come to {accountedFor}.",
  "balance.missingHint":
    "Something may have been missed when the photo was read - check for a line that didn't make it.",
  "balance.extraHint": "A line may have been read twice, or a price misread.",

  // --- An item row --------------------------------------------------------
  "item.newItem": "New item",
  "item.editAria": "Edit {name}",
  "item.newItemFallback": "new item",
  "item.nameLabel": "Item name",
  "item.priceAria": "Price for {name} in dollars",
  "item.quantityAria": "Quantity for {name}",
  "item.deleteAria": "Delete {name}",
  "item.unnamed": "Unnamed item",
  "item.genericItem": "item",
  "item.thisItem": "this item",
  "item.unknownPerson": "Unknown",
  "item.rowNotClaimed": "Not claimed",
  "item.rowClaimedBy": "Claimed by {names}",
  "item.rowQuantity": ", quantity {count}",
  "item.everyone": "Everyone",
  "item.eachAmount": "{amount} each",
  "item.tapToClaim": "Tap to claim",
  "item.joinToClaim": "Join to claim items",
  "item.removeClaimAria": "Remove {name}'s claim on {item}",

  // --- Tax & tip ----------------------------------------------------------
  "tax.documentTitle": "Tax & Tip",
  "tax.heading": "Taxes & Fees",
  "tax.setByHost": "set by host",
  "tax.feeLabelPlaceholder": "Label",
  "tax.feeNameAria": "Name of fee {label}",
  "tax.feeUnnamed": "(unnamed)",
  "tax.feeAmountAria": "Amount for {label} in dollars",
  "tax.thisFee": "this fee",
  "tax.removeFeeAria": "Remove {label} fee",
  "tax.unnamedFee": "unnamed",
  "tax.addFee": "+ Add fee",
  "tax.newFeeLabel": "New fee",
  "tax.noFees": "No taxes or fees added",
  "tax.feesTotal": "Total taxes & fees:",
  "tip.heading": "Tip",
  "tip.percentSubtotal": "% on subtotal",
  "tip.percentTotal": "% on subtotal + tax",
  "tip.manual": "Manual amount",
  "tip.radioGroupAria": "How to calculate the tip",
  "tip.amountAria": "Tip amount in dollars",
  "tip.percentTotalAria": "Tip percentage of subtotal plus tax",
  "tip.percentSubtotalAria": "Tip percentage of subtotal",
  "tip.readonlyPercentSubtotal": "{value}% on subtotal",
  "tip.readonlyPercentTotal": "{value}% on subtotal + tax",
  "tip.readonlyManual": "{amount} fixed amount",
  "tip.total": "Tip total:",
  "tax.groupTotal": "Group Total",
  "tax.subtotalLine": "Subtotal:",
  "tax.feesLine": "Taxes & Fees:",
  "tax.tipLine": "Tip:",

  // --- Totals -------------------------------------------------------------
  "totals.documentTitle": "Totals",
  "totals.loading": "Loading totals...",
  "totals.unclaimedWarning": {
    one: "{count} item still up for grabs —",
    other: "{count} items still up for grabs —",
  },
  "totals.you": "You",
  "totals.hostBadge": "Host",
  "totals.doneBadge": "✓ Done",
  "totals.doneClaimingTitle": "Done claiming",
  "totals.settledBadge": "Settled",
  "totals.itemsLine": "Items {amount}",
  "totals.feesLine": "Taxes & Fees {amount}",
  "totals.tipLine": "Tip {amount}",
  "totals.claimedItems": "Claimed Items",
  "totals.noneClaimed": "No items claimed yet",
  "totals.splitCount": "· split {count}",
  "totals.tableTotal": "Table total",
  "totals.excludesUnclaimed": "excludes {amount} unclaimed",
  "totals.imDoneClaiming": "I'm done claiming",
  "totals.stillClaiming": "Still claiming: {names}",
  "totals.everyoneDone": "Everyone's done claiming — these totals are final.",
  "totals.shareCopied": "Copied to clipboard",
  "totals.shareFailed": "Couldn't share — try again",
  "totals.share": "Share the split",
  "totals.unlockBill": "Unlock this bill",
  "totals.lockBill": "Lock this bill",
  "totals.lockingExplainer":
    "Locking freezes items and claims so nothing changes after people pay.",
  "totals.noParticipants": "No participants yet",

  // --- Settle up ----------------------------------------------------------
  "settle.payAmount": "Pay {name} {amount}",
  "settle.payVia": "Pay {name} via {handle}",
  "settle.settled": "✓ Settled",
  "settle.settledBadge": "✓ Settled",
  "settle.markSettled": "Mark settled",
  "settle.noHandle": "{name} hasn't added a payment handle",
  "settle.othersPayYou": "Others pay you at {method} {handle}",
  "settle.paidViaChange": "Paid via {method} {handle} — change",
  "settle.addHandle": "+ Add how you get paid back",
  "settle.handleLabel": "Your {method} handle",
  "settle.paypalPlaceholder": "your-paypal-name",
  "settle.handlePlaceholder": "your-handle",
  "settle.couldNotSave": "Could not save that handle.",
  "settle.methodOther": "Other",

  // --- QR -----------------------------------------------------------------
  "qr.title": "QR code for bill {code}",
  "qr.hint": "Point a camera at this to open the bill.",

  // --- Connection ---------------------------------------------------------
  "connection.reconnecting": "Reconnecting...",
  "connection.connecting": "Connecting...",
  "connection.lost": "Connection lost",

  // --- Theme --------------------------------------------------------------
  "theme.switchTo": "Switch to {name}",

  // --- Shared summary text (pasted into a group chat) ---------------------
  "share.headingMerchant": "Split for {merchant}",
  "share.heading": "Bill split",
  "share.total": "Total: {amount}",
  "share.unclaimed": "Unclaimed: {amount} still to be split",
  "share.openBill": "Open the bill: {url}",
  "share.code": "Code: {code}",
};

export type Messages = typeof en;
export type MessageKey = keyof Messages;
