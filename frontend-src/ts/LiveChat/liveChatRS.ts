import { PongGame } from "../multiPlayerGame";
import { gamePage, showGamePage, showPage, startMultiplayerGame } from "../router";
import { SocketManager } from "../socketManager";
import { DOM } from "./chatElements";
import { ChatSocketManager } from "./chatSocketManager";
import { currentTargetID, getFriendsAll, showOptions,
		currentOptionsWindow, getFriendsBlocked, addChatHistory,
		closeChat, resetGoToBottomMsgCount,
		tournamentID,
		activeMenu,
		activeExMenu} from "./liveChat";

const chatSocket = ChatSocketManager.getInstance();
let lastLoadedMsgTime: string;
let nothingMoreToLoad: boolean = false;
export let lastMsgDateISO: string;
export function updateLastMsgDateISO(update: string) {lastMsgDateISO = update;}

// ------------ View Profile functions ------------
DOM.headerPicArea.addEventListener("click", () => {
	DOM.profileViewName.innerHTML = DOM.headerName.innerHTML;
	if (!DOM.headerPic.src.match("T"))
	{
		DOM.profileViewPic.src = DOM.headerPic.src;
		DOM.profileViewPic.classList.remove('hidden');
	}
	// plus the rest of information from database -> TBD
	DOM.profileView.classList.remove('hidden');
});

DOM.headerName.addEventListener("click", () => {
	DOM.profileViewName.innerHTML = DOM.headerName.innerHTML;
	if (!DOM.headerPic.src.match("T"))
	{
		DOM.profileViewPic.src = DOM.headerPic.src;
		DOM.profileViewPic.classList.remove('hidden');
	}
	// plus the rest of information from database -> TBD
	DOM.profileView.classList.remove('hidden');
});

DOM.closeProfileViewBtn.addEventListener("mouseup", () => {
	DOM.profileView.classList.add('hidden');
	DOM.profileViewPic.classList.add('hidden'); // reset, cause the next one might not have pic uploaded
	
});
// ----------- End View Profile functions --------------


DOM.chatOptionsBtn.addEventListener("mouseup", () => {
	DOM.chatMsgArea.classList.add('hidden');
	DOM.chatFooter.classList.add('hidden');
	DOM.chatFooterBlocked.classList.add('hidden');
	checkBlocksForOptionsBtn();
	DOM.goToBottomIcon.classList.add('hidden');
});

const closeChatsOptionsBtns = document.querySelectorAll<HTMLButtonElement>('.close-chat-options-btn');
closeChatsOptionsBtns.forEach(btn => {
	btn.addEventListener("mouseup", async () => {
		await manageChatFooter(); // Needs to come first, otherwise scroll position will change when msgaArea comes and there is no footer
		DOM.chatsMenuOptions.classList.add('hidden');
		DOM.chatsMenuBlockedOptions.classList.add('hidden');
		DOM.chatsMenuBlockedByOptions.classList.add('hidden');
		DOM.chatMsgArea.classList.remove('hidden');
		DOM.goToBottomIcon.classList.remove('hidden');
	});
});


// --------------- OPTIONS BUTTONS ----------------

const viewProfileBtns = document.querySelectorAll<HTMLButtonElement>('.view-profile-btn');
viewProfileBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		DOM.profileViewName.innerHTML = DOM.headerName.innerHTML;
		if (!DOM.headerPic.src.match("T"))
		{
			DOM.profileViewPic.src = DOM.headerPic.src;
			DOM.profileViewPic.classList.remove('hidden');
		}
		// plus the rest of information from database -> TBD
		DOM.profileView.classList.remove('hidden');
	});
});

DOM.addFriendBtn.addEventListener('mouseup', () => {
	sendRequest();
});

DOM.acceptRequestBtn.addEventListener('mouseup', () => {
	acceptRequest();
});

DOM.declineRequestBtn.addEventListener('mouseup', () => {
	declineRequest();
});

const removeFromFriendsBtns = document.querySelectorAll<HTMLButtonElement>('.remove-from-friends-btn');
removeFromFriendsBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		// ask for confirmation
		DOM.confirmRemoveFriend.classList.remove('hidden');
		DOM.removeFriendNick.innerHTML = DOM.headerName.innerHTML;
		currentOptionsWindow.classList.add('hidden');
	});
});

DOM.removeFriendNoBtn.addEventListener('mouseup', () => {
	DOM.confirmRemoveFriend.classList.add('hidden');
	currentOptionsWindow.classList.remove('hidden');
});

DOM.removeFriendYesBtn.addEventListener('mouseup', () => {
	removeFromFriends();
	DOM.confirmRemoveFriend.classList.add('hidden');
});

const blockBtns = document.querySelectorAll<HTMLButtonElement>('.block-btn');
blockBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		blockFriend();
	});
});

const unblockBtns = document.querySelectorAll<HTMLButtonElement>('.unblock-btn');
unblockBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		unblockFriend();
	});
});

const openChatBtns = document.querySelectorAll<HTMLButtonElement>('.open-chat-btn');
openChatBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		openChat();
	});
});


// ---- Sending a message ----

export function displayMessage(type: string, msg: string, method: string, msgTime: string, prevMsgType: string)
{
	const chatBubble = document.createElement('div');
	const msgSpan = document.createElement('span');
	const timeContainer = document.createElement('div');
	const timeSpan = document.createElement('span');
	
	if (type === "received")
	{
		chatBubble.className = "bg-cyan-600 rounded-lg py-0.5 px-2 max-w-xs w-fit break-words hyphens-auto whitespace-pre-wrap";
		if (prevMsgType === "sent")
		{
			if (method === "prepend") chatBubble.classList.add('mb-3');
			else chatBubble.classList.add('mt-2.5', 'mb-0.5');
		}
		else chatBubble.classList.add('mb-0.5');
	}
	else
	{
		chatBubble.className = "self-end bg-pink-600 rounded-lg py-0.5 px-2 max-w-xs w-fit break-words hyphens-auto whitespace-pre-wrap";
		if (prevMsgType === "received")
		{
			if (method === "prepend") chatBubble.classList.add('mb-3');
			else chatBubble.classList.add('mt-2.5', 'mb-0.5');
		}
		else chatBubble.classList.add('mb-0.5');
	}
	
	msgSpan.innerText = msg;
	timeContainer.className = "float-right mt-0.5";
	timeSpan.className = "align-bottom text-[11px] font-medium text-gray-200 ml-3";
	timeSpan.innerText = msgTime;
	
	chatBubble.appendChild(msgSpan);
	chatBubble.appendChild(timeContainer);
	timeContainer.appendChild(timeSpan);
	
	if (method === "prepend")
		DOM.chatMsgArea.prepend(chatBubble);
	else
		DOM.chatMsgArea.appendChild(chatBubble);
}

function formatMessage(msg: string): string
{
	const lines = msg.split("\n");
	
	// Remove empty lines from the beginning
	while (lines.length > 0 && lines[0].trim() === "")
		lines.shift();
	
	// Spaces or empty new lines in the middle stay
	
	// Remove empty lines from the end
	while (lines.length > 0 && lines[lines.length - 1].trim() === "")
		lines.pop();
	
	
	// Remove leading and trailing spaces
	lines[0] = lines[0].trim();
	lines[lines.length - 1] = lines[lines.length - 1].trim();
	return lines.join("\n");
}

let oldInputHeight = 32;
DOM.chatInput.addEventListener('input', () => {
	DOM.chatInput.style.height = "32px"; // Reset input area height
	DOM.chatInput.style.height = DOM.chatInput.scrollHeight + 'px'; // grow to content
	// DOM.chatInput.scrollTop = DOM.chatInput.scrollHeight; // while typing it scrolls down so the text is fully visible
	let difference = DOM.chatInput.clientHeight - oldInputHeight;
	
	if (difference)
	{
		DOM.chatMsgArea.scrollTop += difference;
		if (difference > 0)
		{
			console.log("MOVING goToBtmBtn UP");
			DOM.goToBottomIcon.classList.remove("bottom-16");
			DOM.goToBottomIcon.classList.add("bottom-24");
		}
		else
		{
			console.log("MOVING goToBtmBtn DOWN");
			DOM.goToBottomIcon.classList.remove("bottom-24");
			DOM.goToBottomIcon.classList.add("bottom-16");
		}
	}
	oldInputHeight = DOM.chatInput.clientHeight;
	
	// I need to reset input height to 32 everytime, so it can shrink properly and because I am doing that,
	// browser sees for this quick moment an unnatural gap between messages area and the input, so it adjusts
	// the position(scroll) of msgs area element to eliminate the gap. But I do enhance the height of input
	// right back when necessary, so I end up with input overlaping the messages. That's why I need to correct
	// this here. Because I increase input height (by 24px), chatMsgArea clientHeight decreases (by 24px).
	// So this expression === 0, means the scroll is at the very bottom, when I have something left, that means
	// the scroll went up, or in this case, that clientHeight decreased. So if it's up to < 25, I scroll down again.
	if (DOM.chatMsgArea.scrollHeight - (DOM.chatMsgArea.scrollTop + DOM.chatMsgArea.clientHeight) < 25)
		DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight;

});

DOM.chatInput.addEventListener('keydown', (e) => {
	if (e.key === "Enter")
	{
		if (e.shiftKey) // Return -> Let (Shift + Enter) make a new line
			return;
		
		e.preventDefault(); // Default is to make a new line, that's why I check for Shift before
		DOM.sendMsgBtn.click();
	}
});

DOM.sendMsgBtn.addEventListener('click', async () => {
	if (!await chatSocket.serverAlive())
	{
		alert("Chat service is not available. Try again later");
		return;
	}
	const msg = DOM.chatInput.value.trim();
	if (!msg)
		return;
	const formatted = formatMessage(DOM.chatInput.value);
	let time = new Date().toISOString();

	const status = await chatSocket.recordMessage(currentTargetID, formatted, time);
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	const target = DOM.chatHistory.querySelector(`li[data-id="${currentTargetID}"]`);
	if (!target) // Not in chat history yet --> New conversation
		addChatHistory(DOM.headerName.innerHTML, DOM.headerPic.src, formatted, currentTargetID, 0, "prepend");
	else
	{
		const msgPreview = target.querySelector('.msg-preview') as HTMLParagraphElement;
		msgPreview.innerHTML = formatted;
		DOM.chatHistory.prepend(target);
	}
	
	const timeHM = convertISOtoLocaleHM(time);
	const bottomMsg = DOM.chatMsgArea.lastChild as HTMLDivElement | null;
	let prevMsgType = bottomMsg ? (bottomMsg.classList.contains("self-end") ? "sent" : "received") : "none";
	
	if (prevMsgType === "none") // Very first message in chat (lastMsgDateISO is empty)
		displayDateTag(time, time, "append", true);
	else
		prevMsgType = displayDateTag(lastMsgDateISO, time, "append") ? "none" : prevMsgType;
	
	lastMsgDateISO = time; // Update last msg date
	displayMessage("sent", formatted, "append", timeHM, prevMsgType);
	DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight;
	DOM.chatInput.value = "";
	DOM.chatInput.style.height = "32px"; // Reset input area height after sent message
	DOM.chatInput.focus();
});

DOM.goToBottomBtn.addEventListener('click', () => {
	DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight;
	resetGoToBottomMsgCount();
});

const inviteToPlayBtns = document.querySelectorAll<HTMLButtonElement>('.invite-to-play-btn');
inviteToPlayBtns.forEach(btn => {
	btn.addEventListener('mouseup', () => {
		sendGameInvitation(btn);
	});
});

DOM.declineGameInviteBtn.addEventListener('click', async () => {
	await chatSocket.removeInvitation("received");
	DOM.gameInviteBanner.classList.add('hidden');
	manageInviteBtnStatus(currentOptionsWindow);
});

DOM.acceptGameInviteBtn.addEventListener('click', () => {
	acceptAndCheck();
});



// ---- Database related functions ----

async function sendRequest()
{
	const status = await chatSocket.recordRequest(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	DOM.addFriendBtn.classList.add('hidden');
	DOM.requestSentInfo.classList.remove('hidden');
}

async function acceptRequest()
{
	const status = await chatSocket.acceptFriendRequest(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	showOptions(DOM.friendsMenuOptions);
	getFriendsAll();
	
	const request = DOM.requestsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (request)
		request.remove();
	if (!DOM.requestsList.children.length && activeMenu === "Friends" && activeExMenu === "Requests")
		DOM.noRequests.classList.remove('hidden');
}

async function declineRequest()
{
	const status = await chatSocket.declineFriendRequest(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	DOM.addFriendBtn.classList.remove('hidden');
	DOM.requestSentInfo.classList.add('hidden');
	showOptions(DOM.usersMenuOptions);

	const request = DOM.requestsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (request)
		request.remove();
	if (!DOM.requestsList.children.length && activeMenu === "Friends" && activeExMenu === "Requests")
		DOM.noRequests.classList.remove('hidden');
}

async function removeFromFriends()
{
	const status = await chatSocket.removeFriend(currentTargetID);
	
	if (status === "error")
	{
		currentOptionsWindow.classList.remove('hidden');
		alert("Something went wrong. Please try again later");
		return;
	}
	
	closeChat();
	DOM.addFriendBtn.classList.remove('hidden');
	DOM.requestSentInfo.classList.add('hidden');
	showOptions(DOM.usersMenuOptions);

	// Remove from chat history list
	const chat = DOM.chatHistory.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (chat)
		chat.remove();
	if (!DOM.chatHistory.children.length && activeMenu === "Chats")
		DOM.noChats.classList.remove('hidden');

	// Remove from friends list
	const friend = DOM.friendsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (friend)
		friend.remove();
	if (!DOM.friendsList.children.length && activeMenu === "Friends" && activeExMenu === "All")
		DOM.noFriends.classList.remove('hidden');
	
	// Remove from blocked list
	const blocked = DOM.blockedList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (blocked)
		blocked.remove();
	if (!DOM.blockedList.children.length && activeMenu === "Friends" && activeExMenu === "Blocked")
		DOM.noBlocked.classList.remove('hidden');
	
	chatSocket.removeInvitation("sent");
	chatSocket.removeInvitation("received");
}

async function blockFriend()
{
	DOM.gameInviteBanner.classList.add('hidden');
	const status = await chatSocket.blockUser(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	getFriendsBlocked();
	// According to where you blocked from, show corresponding blocked menu
	// If it was blockedBy menu, change it too, blocked has priority
	if (currentOptionsWindow === DOM.chatsMenuOptions || currentOptionsWindow === DOM.chatsMenuBlockedByOptions)
		showOptions(DOM.chatsMenuBlockedOptions);
	else
		showOptions(DOM.friendsMenuExBlockedOptions);
	chatSocket.removeInvitation("sent");
}

async function unblockFriend()
{
	const status = await chatSocket.unblockUser(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	const blocked = DOM.blockedList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
	if (blocked)
		blocked.remove();
	if (!DOM.blockedList.children.length && activeMenu === "Friends" && activeExMenu === "Blocked")
		DOM.noBlocked.classList.remove('hidden');
	
	checkForBlockedByAfterUnblock();
}

async function checkForBlockedByAfterUnblock()
{
	const status = await chatSocket.checkBlocks(currentTargetID);
	
	if (status === "error" || status === "not friends")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	if (status === "blocked by target")
	{
		if (currentOptionsWindow === DOM.chatsMenuBlockedOptions)
			showOptions(DOM.chatsMenuBlockedByOptions);
		else
			showOptions(DOM.blockedByUserOptions);
	}
	else
	{
		if (currentOptionsWindow === DOM.chatsMenuBlockedOptions)
			showOptions(DOM.chatsMenuOptions);
		else
			showOptions(DOM.friendsMenuOptions);
	}
}

// This is gonna display regular input area or a message about block
export async function manageChatFooter()
{
	if (currentTargetID === tournamentID)
	{
		DOM.chatFooter.classList.add('hidden');
		DOM.chatFooterBlocked.classList.add('hidden');
		return;
	}
	
	const status = await chatSocket.checkBlocks(currentTargetID);
	
	if (status === "error" || status === "not friends")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	if (status === "no blocks")
	{
		DOM.chatFooterBlocked.classList.add('hidden');
		DOM.chatFooter.classList.remove('hidden');
	}
	else if (status === "mutual block" || status === "target blocked")
	{
		DOM.chatFooter.classList.add('hidden');
		DOM.chatFooterBlocked.innerHTML = "You have blocked this user";
		DOM.chatFooterBlocked.classList.remove('hidden');
	}
	else
	{
		DOM.chatFooter.classList.add('hidden');
		DOM.chatFooterBlocked.innerHTML = "You have been blocked by this user";
		DOM.chatFooterBlocked.classList.remove('hidden');
	}
}

async function checkBlocksForOptionsBtn()
{
	const status = await chatSocket.checkBlocks(currentTargetID);
	
	if (status === "error" || status === "not friends")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	if (status === "no blocks")
		showOptions(DOM.chatsMenuOptions);
	else if (status === "mutual block" || status === "target blocked")
		showOptions(DOM.chatsMenuBlockedOptions);
	else
		showOptions(DOM.chatsMenuBlockedByOptions);
}

export function convertISOtoLocaleHM(fullTime: string): string
{
	// Extracting HH:MM from format --> "2025-09-30T17:01:53.336Z"
	return new Date(fullTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); // adapts to local time format 12h or 24h
}

export function displayDateTag(time1: string, time2: string, method: string, afterLoadOrFirst: boolean = false): boolean
{
	// Same day - no need for adding date tag
	if ((time1.split("T")[0] === time2.split("T")[0]) && (afterLoadOrFirst === false))
		return false;
	
	const dateTag = document.createElement('div');
	
	// After last loaded message - prepend. Will remove in onChatScroll() if needed.
	if (afterLoadOrFirst) // This will be on very top so no mt-8, anyway msgs container has padding
		dateTag.className = "self-center w-fit mb-4 bg-black text-yellow-300 text-opacity-90 rounded-full px-4 text-sm font-semibold justify-center items-center";
	else
		dateTag.className = "self-center w-fit mt-10 mb-4 bg-black text-yellow-300 text-opacity-90 rounded-full px-4 text-sm font-semibold justify-center items-center";
	
	if (method === "prepend")
	{
		dateTag.dataset.dateISO = time1;
		dateTag.innerHTML = new Date(time1).toLocaleDateString().replace(/\D/g, ".");
		DOM.chatMsgArea.prepend(dateTag);
	}
	else
	{
		dateTag.dataset.dateISO = time2;
		dateTag.innerHTML = new Date(time2).toLocaleDateString().replace(/\D/g, ".");
		DOM.chatMsgArea.appendChild(dateTag);
	}
	return true;
	// If this function returns true, that means it added date tag, and prevMsgType
	// is gonna be set to 'date' (or could be whatever else than 'received' or 'sent')
	// to let displayMessage() know that it should not set any margins for current message being displayed
}

export async function openChat()
{
	// Because I am setting scrollTop manually after prepending messages
	// this eventListener was catching it and was messing up UI in some browsers,
	// so I disable it here and at the end of the function I'm adding it back
	DOM.chatMsgArea.removeEventListener('scroll', onChatScroll);
	chatSocket.emit("update chat and target info", currentTargetID, "chatID");
	checkGameInvitations();
	if (currentTargetID !== tournamentID)
	{
		const status = await chatSocket.getOnlineStatus();
		if (status === "Online")
		{
			DOM.statusDot.classList.remove('bg-red-600');
			DOM.statusDot.classList.add('bg-green-500');
			DOM.onlineStatus.innerHTML = "Online";
		}
		else
		{
			DOM.statusDot.classList.remove('bg-green-500');
			DOM.statusDot.classList.add('bg-red-600');
			DOM.onlineStatus.innerHTML = "Offline";
		}
	}
	
	nothingMoreToLoad = false;
	DOM.chatMsgArea.replaceChildren();
	currentOptionsWindow.classList.add('hidden');
	DOM.tournamentMainChatArea.classList.add('hidden'); // This will have to be removed
	DOM.chatMainArea.classList.remove('hidden');
	DOM.chatMsgArea.classList.remove('hidden');
	manageChatFooter();
	DOM.chatOptionsBtn.classList.remove('hidden');
	DOM.chatInput.value = "";
	DOM.chatInput.style.height = "32px";
	DOM.goToBottomIcon.classList.remove("bottom-[20%]");
	DOM.goToBottomIcon.classList.add("bottom-[14%]");
	oldInputHeight = 32;
	
	const msgs = currentTargetID === tournamentID
				? await chatSocket.loadTournamentMessages()
				: await chatSocket.loadMessages(currentTargetID);
	
	if (msgs.length === 0)
		return;
	
	lastLoadedMsgTime = msgs[msgs.length - 1].created_at;
	let time: string;
	let prevMsgType = "none";
	let prevMsgDate = msgs[0].created_at;
	lastMsgDateISO = msgs[0].created_at;
	
	for (const msg of msgs)
	{
		time = convertISOtoLocaleHM(msg.created_at);
		prevMsgType = displayDateTag(prevMsgDate, msg.created_at, "prepend") ? "date" : prevMsgType;
		if (msg.sender_id === currentTargetID || currentTargetID === tournamentID)
		{
			displayMessage("received", msg.message, "prepend", time, prevMsgType);
			prevMsgType = "received";
		}
		else
		{
			displayMessage("sent", msg.message, "prepend", time, prevMsgType);
			prevMsgType = "sent";
		}
		prevMsgDate = msg.created_at;
	}
	displayDateTag(prevMsgDate, prevMsgDate, "prepend", true);
	DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight; // Scroll to the bottom
	const currentChat = DOM.chatHistory.querySelector(`li[data-id="${currentTargetID}"]`);
	currentChat?.querySelector('.notification-dot')?.classList.add('hidden');
	DOM.chatMsgArea.addEventListener('scroll', onChatScroll);
}

async function checkGameInvitations()
{
	const status = await chatSocket.recordOrCheckGameInvitation("check");
	
	if (status === "received")
	{
		// here display banner if received invitation 
		// or waiting for response... if sent ?
		// need also hide banner on chat switch and on options being shown
		// when receiving while in chat options, make update notification or display short one and on close
		// check invites again - maybe it's gone before you closed options...
		DOM.gameInviteFrom.innerHTML = DOM.headerName.innerHTML; // or get from db? but this should be fine
		DOM.gameInviteBanner.classList.remove('hidden');
	}
	else
		DOM.gameInviteBanner.classList.add('hidden');
}

export async function manageInviteBtnStatus(nextOptionsWindow: HTMLElement, onOnlineStatusChange: string = "")
{
	// First reset current window invite btn state (if it has one)
	const inviteBtnCurrent = currentOptionsWindow.querySelector('.invite-to-play-btn');
	if (inviteBtnCurrent)
	{
		const btnInfo = inviteBtnCurrent.querySelector('span');
		if (btnInfo)
			inviteBtnCurrent.removeChild(btnInfo);
		inviteBtnCurrent.classList.remove("text-yellow-300", "text-opacity-50", "pointer-events-none");
		inviteBtnCurrent.classList.add("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");

		// This is only for when this function is used in events on online status change in real time
		if (onOnlineStatusChange)
		{
			if (onOnlineStatusChange === "offline")
			{
				inviteBtnCurrent.classList.remove("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");
				inviteBtnCurrent.classList.add("text-yellow-300", "text-opacity-50", "pointer-events-none");
			}
			return;
			// If status went to online - reset at the begining of the function already sets correct state
		}
	}
	
	// Then check and manage state for the one being shown (if it has one)
	const inviteBtnNext = nextOptionsWindow.querySelector('.invite-to-play-btn');
	if (inviteBtnNext)
	{
		const status = await chatSocket.recordOrCheckGameInvitation("check");
		if (status === "error")
			return (alert("Something went wrong. Please try again later"));
		if (status === "can send")
			return; // No change needed
		if (status === "offline")
		{
			inviteBtnNext.classList.remove("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");
			inviteBtnNext.classList.add("text-yellow-300", "text-opacity-50", "pointer-events-none");
		}
		else
		{
			const btnInfo = document.createElement('span');
			btnInfo.className = "text-yellow-300 text-opacity-50 italic justify-center -mt-1 flex text-sm font-normal";
			btnInfo.innerText = "(Waiting for response...)";
			inviteBtnNext.classList.remove("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");
			inviteBtnNext.classList.add("text-yellow-300", "text-opacity-50", "pointer-events-none");
			inviteBtnNext.appendChild(btnInfo);
		}
	}
}


async function onChatScroll()
{
	// !!! scrollTop = distance from the top of hidden content to the top of visible content !!!
	// scrollHeight = Full height of visible plus hidden content
	// clientHeight = height of the visible content i.e. the container that has scroll
	
	if (DOM.chatMsgArea.scrollTop < DOM.chatMsgArea.scrollHeight - DOM.chatMsgArea.clientHeight - 50) {
		DOM.goToBottomIcon.classList.remove("opacity-0");
		DOM.goToBottomIcon.classList.add("opacity-100");
		DOM.goToBottomIcon.classList.remove('pointer-events-none');
	}
	else {
		DOM.goToBottomIcon.classList.remove("opacity-100");
		DOM.goToBottomIcon.classList.add("opacity-0");
		DOM.goToBottomIcon.classList.add('pointer-events-none');
		resetGoToBottomMsgCount();
	}

	if (DOM.chatMsgArea.scrollTop > 200 || nothingMoreToLoad) // Not near the top or no more msg to load
		return;
	
	const msgs = currentTargetID === tournamentID
				? await chatSocket.loadMoreTournamentMessages(lastLoadedMsgTime)
				: await chatSocket.loadMoreMessages(currentTargetID, lastLoadedMsgTime);
	
	if (msgs.length === 0)
	{
		nothingMoreToLoad = true;
		return;
	}

	const oldHeight = DOM.chatMsgArea.scrollHeight;
	lastLoadedMsgTime = msgs[msgs.length - 1].created_at;
	let time: string;
	
	// First will always be dateTag so we get the date and compare with first to add msg.created_at
	// If they are the same --> delete the tag, cause we're prepending messages from the same day still, 
	// else leave the tag and continue prepending and checking.
	// Because I'm displaying in locale time, i need to get utc time in ISO format back for comparing.
	// Can't just get .innerHTML
	let prevMsgDate = (DOM.chatMsgArea.children[0] as HTMLDivElement).dataset.dateISO!; // current top Date Tag (ISO format)
	let prevMsgType = DOM.chatMsgArea.children[1].classList.contains("self-end") ? "sent" : "received";
	
	if (prevMsgDate.split("T")[0] === (msgs[0].created_at).split("T")[0])
		DOM.chatMsgArea.children[0].remove()
	
	for (const msg of msgs)
	{
		time = convertISOtoLocaleHM(msg.created_at);
		prevMsgType = displayDateTag(prevMsgDate, msg.created_at, "prepend") ? "date" : prevMsgType;
		if (msg.sender_id === currentTargetID)
		{
			displayMessage("received", msg.message, "prepend", time, prevMsgType);
			prevMsgType = "received";
		}
		else
		{
			displayMessage("sent", msg.message, "prepend", time, prevMsgType);
			prevMsgType = "sent";
		}
		prevMsgDate = msg.created_at;
	}
	displayDateTag(prevMsgDate, prevMsgDate, "prepend", true);
	
	// Keeps the scroll in place after loading older messages - prevents jump
	// The '+ 200' is needed because I start loading when scroll is not exactly at the top
	// but 200px from it, and without this adjustment it would jump up these 200px
	DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight - oldHeight + 200;
}

async function sendGameInvitation(inviteBtn: HTMLButtonElement)
{
	const socketManager = SocketManager.getInstance();
	const existingGame = socketManager.getGameInstance();

	if (existingGame && existingGame.gameRunning) {
		alert('You are still in a game');
		return;
	}

	const invitationStatus = await chatSocket.recordOrCheckGameInvitation("record");
	if (invitationStatus !== "success")
		return (alert( invitationStatus === "offline" ? "This user is currently offline"
					: invitationStatus === "already sent" ? "You have already invited this user"
					: invitationStatus === "already received" ? "This user has already invited you"
					: "Something went wrong. Please try again later"));
	
	const btnInfo = document.createElement('span');
	btnInfo.className = "text-yellow-300 text-opacity-50 italic justify-center -mt-1 flex text-sm font-normal";
	btnInfo.innerText = "(Waiting for response...)";
	inviteBtn.classList.remove("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");
	inviteBtn.classList.add("text-yellow-300", "text-opacity-50", "pointer-events-none");
	inviteBtn.appendChild(btnInfo);
}

async function acceptAndCheck() 
{
	DOM.gameInviteBanner.classList.add('hidden');
	const status = await chatSocket.checkIfAvailable();
	if (status === "offline")
	{
		DOM.feedbackFrom.innerHTML = DOM.headerName.innerHTML;
		DOM.feedbackMsg.innerHTML = "is currently offline";
		DOM.feedbackBanner.classList.remove('hidden');
		setTimeout(() => {
			DOM.feedbackBanner.classList.add('hidden');
		}, 5000);
	}
}

