async function handleAgentsRequest(request, sendResponse) {
    let message = { error: "Unknown error" };
    try {
        let response = await fetch('https://api.chirper.ai/v1/auth', { credentials: 'include' });
        if (!response.ok) {
            console.error("handleAgentsRequest", "/v1/auth failed", response);
            message.error = `/v1/auth failed: ${response.status} ${response.statusText}`;
            return;
        }
        let result = (await response.json()).result;
        const user = result?.user;
        if (!user?.id) {
            console.error("handleAgentsRequest", "Missing user.id", response);
            message.error = "You must be logged in.";
            return;
        }

        let url = new URL('https://api.chirper.ai/v1/agent');
        url.searchParams.append('user', user.id);
        url.searchParams.append('limit', '1000');
        response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            console.error("handleAgentsRequest", "/v1/agent failed", response);
            message.error = `/v1/agent failed: ${response.status} ${response.statusText}`;
            return;
        }
        result = (await response.json()).result;
        const agents = result?.agents;
        if (!Array.isArray(agents)) {
            console.error("handleAgentsRequest", "Missing ['agents']", response);
            message.error = "Missing or invalid ['agents']";
            return;
        }

        message.agents = agents;
        delete message.error;
    } catch (e) {
        console.error("handleAgentsRequest", e);
        message.error = e.toString();
        throw e;
    } finally {
        sendResponse(message);
    }
}

async function handleReplyWithRequest(request, sendResponse) {
    const agent = request.replyWith;
    console.assert(agent);

    const threadId = (document.location.href.match(/\/post\/([a-f0-9]{16})/) || [])[1];
    if (!threadId) {
        console.error("Cannot extract thread ID from URL", document.location.href);
        return;
    }

    let response = await fetch(`https://api.chirper.ai/v1/post/${threadId}`, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/post failed", response);
        return;
    }
    let post = (await response.json()).result;
    if (!post) {
        console.error("Missing ['post']", response);
        return;
    }

    let url = new URL('https://api.chirper.ai/v1/post');
    url.searchParams.append('parent', threadId);
    url.searchParams.append('limit', '1000');
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v1/post?parent= failed", response);
        return;
    }
    const replies = (await response.json()).result?.posts?.map(p => p[0]);
    if (!replies) {
        console.error("Missing or invalid ['posts']", response);
        return;
    }
    const thread = [post, ...replies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const participants = new Map();
    for (const { agent } of thread) {
        if (!agent || participants.has(agent.id)) continue;
        participants.set(agent.id, agent);
    }

    const promptTemplate = await (await fetch(chrome.runtime.getURL('prompt.md.liquid'))).text();
    const prompt = await liquidEngine.parseAndRender(promptTemplate, {
        agent,
        thread,
        participants: participants.values(),
    });
    console.log("Prompt:", prompt);

    response = await fetch(`https://api.chirper.ai/v2/chat/${agent.id}?goal=autonomous`, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v2/chat failed", response);
        return;
    }
    const chat = (await response.json()).result;
    if (!chat?.id) {
        console.error("Missing ['chat']['id']", response);
        return;
    }

    url = new URL('https://api.chirper.ai/v2/message');
    url.searchParams.append('chat', chat.id);
    url.searchParams.append('limit', '1');
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        console.error("/v2/message failed", response);
        return;
    }
    const messages = (await response.json()).result?.messages;
    if (!Array.isArray(messages)) {
        console.error("Missing or invalid ['messages']", response);
        return;
    }

    const temp = Date.now()
    response = await fetch(`https://api.chirper.ai/v2/chat/${chat.id}/emit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            "temp": temp,
            "goal": "autonomous",
            "agent": agent.id,
            "messages": [
                ...messages,
                {
                    "id": `user-${temp}`,
                    "role": "user",
                    "createdAt": new Date().toISOString(),
                    "content": [
                        { "type": "text", "text": prompt }
                    ]
                }
            ]
        })
    });
    if (!response.ok) {
        console.error("/v2/chat/emit failed", response);
        return;
    }

    sendResponse(true);
}

function sendCanReply() {
    const canReply = location.href.includes("//chirper.ai/post/");
    console.log("content-script", "sendCanReply", canReply);
    port.postMessage({ canReply });
}

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log("content-script", "runtime.onMessage", request);
        if (request.agents) {
            handleAgentsRequest(request, (response) => {
                console.log("handleAgentsRequest", "response:", response);
                sendResponse(response)
            });
            return true;
        } else if (request.replyWith) {
            handleReplyWithRequest(request, sendResponse);
            return true;
        }
    }
);

console.log("content-script", "onMessage listener added");
const port = chrome.runtime.connect();
sendCanReply();

let lastUrl = location.href; 
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log("content-script", "URL changed:", url);
        sendCanReply();
    }
});