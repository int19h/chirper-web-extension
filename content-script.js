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
    } finally {
        sendResponse(message);
    }
}

async function handleReplyWithRequest(request, sendResponse) {
    function logError(text, ...args) {
        console.error(text, ...args);
        sendResponse({ error: text });
    }
    try {
        const instructions = request.instructions;
        const agent = request.replyWith;
        console.assert(agent);

        const threadId = (document.location.href.match(/\/post\/([a-f0-9]{16})/) || [])[1];
        if (!threadId) {
            logError("Cannot extract thread ID from URL", document.location.href);
            return;
        }

        let response = await fetch(`https://api.chirper.ai/v1/post/${threadId}`, { credentials: 'include' });
        if (!response.ok) {
            logError(`/v1/post failed: ${response.status} ${response.statusText}`, response);
            return;
        }
        let post = (await response.json()).result;
        if (!post) {
            logError("Missing ['post']", response);
            return;
        }

        let url = new URL('https://api.chirper.ai/v1/post');
        url.searchParams.append('parent', threadId);
        url.searchParams.append('limit', '1000');
        response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            logError(`/v1/post?parent= failed: ${response.status} ${response.statusText}`, response);
            return;
        }
        const replies = (await response.json()).result?.posts?.map(p => p[0]);
        if (!replies) {
            logError("Missing or invalid ['posts']", response);
            return;
        }
        const thread = [post, ...replies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        const promptTemplate = await (await fetch(chrome.runtime.getURL('prompt.md.liquid'))).text();
        let prompt;
        while (true) {
            const participants = new Map();
            for (const { agent } of thread) {
                if (!agent || participants.has(agent.id)) continue;
                participants.set(agent.id, agent);
            }
            prompt = (await liquidEngine.parseAndRender(promptTemplate, {
                agent,
                thread,
                instructions,
                participants: participants.values(),
            })).trim();
            if (prompt.length <= 45000 || thread.length <= 2) break;
            thread.splice(1, 1);
        }
        console.log("Prompt:", prompt);

        response = await fetch(`https://api.chirper.ai/v2/chat/${agent.id}?goal=autonomous`, { credentials: 'include' });
        if (!response.ok) {
            logError(`/v2/chat failed: ${response.status} ${response.statusText}`, response);
            return;
        }
        const chat = (await response.json()).result;
        if (!chat?.id) {
            logError("Missing ['chat']['id']", response);
            return;
        }

        url = new URL('https://api.chirper.ai/v2/message');
        url.searchParams.append('chat', chat.id);
        url.searchParams.append('limit', '1');
        response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            logError(`/v2/message failed: ${response.status} ${response.statusText}`, response);
            return;
        }
        const messages = (await response.json()).result?.messages;
        if (!Array.isArray(messages)) {
            logError("Missing or invalid ['messages']", response);
            return;
        }

        const temp = Date.now()
        const emitRequest = {
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
        };
        response = await fetch(`https://api.chirper.ai/v2/chat/${chat.id}/emit`, emitRequest);
        if (!response.ok) {
            logError(`/v2/chat/emit failed: ${response.status} ${response.statusText}`);
            return;
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : e.toString();
        logError(msg);
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

async function injectThreadReplyButton() {
    if (!location.href.includes("//chirper.ai/post/")) {
        return;
    }
    console.log("content-script", "Thread detected, injecting reply button");

    const dialogHtml = await (await fetch(chrome.runtime.getURL('reply.html'))).text();
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
    const dialog = document.body.lastElementChild;

    var replyButton = document.createElement("button");
    replyButton.style.all = "revert";
    replyButton.style.position = "fixed";
    replyButton.style.bottom = "20px";
    replyButton.style.right = "20px";
    replyButton.innerText = "Reply to thread";
    replyButton.onclick = () => dialog.showModal();
    document.body.appendChild(replyButton);
}

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        console.log("content-script", "URL changed:", url);
        injectThreadReplyButton();
    }
}).observe(document, { subtree: true, childList: true });

injectThreadReplyButton();
