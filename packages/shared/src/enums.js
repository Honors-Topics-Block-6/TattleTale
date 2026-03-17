export var Phase;
(function (Phase) {
    Phase["DAY_OPEN"] = "DAY_OPEN";
    Phase["DAY_VOTE"] = "DAY_VOTE";
    Phase["DAY_RESOLVE"] = "DAY_RESOLVE";
    Phase["NIGHT_ACTIONS"] = "NIGHT_ACTIONS";
    Phase["NIGHT_RESOLVE"] = "NIGHT_RESOLVE";
    Phase["NIGHT_REVEAL"] = "NIGHT_REVEAL";
})(Phase || (Phase = {}));
export var ChannelType;
(function (ChannelType) {
    ChannelType["GLOBAL"] = "GLOBAL";
    ChannelType["PRIVATE"] = "PRIVATE";
    ChannelType["ROLE"] = "ROLE";
    ChannelType["TEMP"] = "TEMP";
    ChannelType["SYSTEM"] = "SYSTEM";
})(ChannelType || (ChannelType = {}));
export var IntentType;
(function (IntentType) {
    IntentType["SEND_MESSAGE"] = "SEND_MESSAGE";
    IntentType["SUBMIT_VOTE"] = "SUBMIT_VOTE";
    IntentType["SUBMIT_NIGHT_ACTION"] = "SUBMIT_NIGHT_ACTION";
})(IntentType || (IntentType = {}));
export var SystemEventType;
(function (SystemEventType) {
    SystemEventType["CHANNEL_LOCKED"] = "CHANNEL_LOCKED";
    SystemEventType["COMMUNICATION_JAMMED"] = "COMMUNICATION_JAMMED";
    SystemEventType["MESSAGE_INTEGRITY_COMPROMISED"] = "MESSAGE_INTEGRITY_COMPROMISED";
    SystemEventType["TEMP_CHANNEL_CREATED"] = "TEMP_CHANNEL_CREATED";
    SystemEventType["PSYCHIC_SIGNAL_RECEIVED"] = "PSYCHIC_SIGNAL_RECEIVED";
    SystemEventType["GAME_STARTED"] = "GAME_STARTED";
})(SystemEventType || (SystemEventType = {}));
export var LobbyStatus;
(function (LobbyStatus) {
    LobbyStatus["WAITING"] = "WAITING";
    LobbyStatus["IN_GAME"] = "IN_GAME";
    LobbyStatus["CLOSED"] = "CLOSED";
})(LobbyStatus || (LobbyStatus = {}));
//# sourceMappingURL=enums.js.map