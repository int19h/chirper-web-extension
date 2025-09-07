chrome.runtime.onInstalled.addListener(() => {
    chrome.action.disable();
});

chrome.runtime.onConnect.addListener((port) => {
    console.log("service-worker", "runtime.onConnect", port);
    port.onMessage.addListener((msg) => {
        console.log("service-worker", "port.onMessage", msg);
        if (canReply in msg) {
            (msg.canReply ? chrome.action.enable : chrome.action.disable)(port.tabId);
        }
    });
    port.onDisconnect.addListener(() => {
        console.log("service-worker", "port.onDisconnect", port);
        chrome.action.disable(port.tabId);
    });
});
