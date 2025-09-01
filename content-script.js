async function handleAgentsRequest(sendResponse) {
    let response = await fetch('https://api.chirper.ai/v1/auth', { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/auth failed", response);
        return;
    }
    let result = (await response.json()).result;
    const user = result?.user;
    if (!user?.id) {
        console.error("Missing user.id", response);
        return;
    }

    let url = new URL('https://api.chirper.ai/v1/agent');
    url.searchParams.append('user', user.id);
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/agent failed", response);
        return;
    }
    result = (await response.json()).result;
    const agents = result?.agents;
    if (!Array.isArray(agents)) {
        console.error("Missing agents", response);
        return;
    }

    sendResponse(agents);
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log("Request:", request);
        if (request.agents) {
            handleAgentsRequest((response) => {
                console.log("Response:", response);
                sendResponse(response)
            });
            return true;
        }
    }
);