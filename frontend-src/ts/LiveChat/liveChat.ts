import { PongGame } from "../multiPlayerGame";
import { ProfileOptions } from "../profileOptions";
import { gamePage, navigateTo, showGamePage, showPage, startMultiplayerGame } from "../router";
import { SocketManager } from "../socketManager";
import { DOM, sendUserEvent } from "./chatElements"
import { ChatSocketManager } from "./chatSocketManager";
import { convertISOtoLocaleHM, displayDateTag, displayMessage, lastMsgDateISO,
	manageChatFooter, manageInviteBtnStatus, openChat, updateLastMsgDateISO} from "./liveChatRS";

interface HtmlLIClone extends HTMLLIElement
{
	original: HTMLLIElement;
}

export const tournamentID = 0;
const chatSocket = ChatSocketManager.getInstance();
export let activeMenu: string = "Chats";
export let activeExMenu: string = "All";
export let activeHeaderMenu: string = "Other";
export let currentTargetID: number = -2;
export let currentOptionsWindow = DOM.usersMenuOptions;
let msgsOnScrollCount: number = 0;
export function resetGoToBottomMsgCount()
{
	msgsOnScrollCount = 0;
	DOM.newMsgsCount.classList.add('hidden');
}
export async function showOptions(optionsMenu: HTMLElement)
{
	
	currentOptionsWindow.classList.add('hidden');
	await manageInviteBtnStatus(optionsMenu); // need to await cause it uses currentOptionsWindow, cannot change before it finishes
	optionsMenu.classList.remove('hidden');
	currentOptionsWindow = optionsMenu;
}

export function loadChatData()
{
	resetLiveChatState();
	getChatHistory(); // Load chats
	getFriendsAll(); // Load friends list
	getFriendsBlocked(); // Load blocked list
	getFriendsRequests(); // Load requests list
}

export async function initLiveChat(chatSocket: ChatSocketManager)
{
	try
	{
		await chatSocket.connect();
		RegisterSocketListeners();
		loadChatData();
	}
	catch (error) {
		console.error(error);
	}
}

function resetLiveChatState()
{
	currentOptionsWindow.classList.add('hidden');
	DOM.profileView.classList.add('hidden');
	DOM.chatMainArea.classList.add('hidden');
	DOM.infoTitle.classList.remove('hidden');
	DOM.chatFooter.classList.add('hidden');
	DOM.chatFooterBlocked.classList.add('hidden');
	DOM.gameInviteBanner.classList.add('hidden');
	DOM.feedbackBanner.classList.add('hidden');
	DOM.chatHeader.classList.add('hidden');
	DOM.tournamentHeader.classList.add('hidden');
	DOM.noRequests.classList.add('hidden');
	DOM.noFriends.classList.add('hidden');
	DOM.noBlocked.classList.add('hidden');
	DOM.noChats.classList.add('hidden');
	DOM.findUser.classList.add('hidden');
	DOM.noResults.classList.add('hidden');
	activeMenu = "Chats";
	activeExMenu = "All";
	activeHeaderMenu = "Other";
	currentTargetID = -2;
	msgsOnScrollCount = 0;
}

export function displayLiveChat()
{
	if (chatSocket.lostConnection())
		return;
	
	const elements = DOM.sideBarMenu.querySelectorAll('button');
	elements.forEach(element => {
		element.innerText.match("Chats")
		? element.classList.add('neon-text-blue')
		: element.classList.remove('neon-text-blue');
	});
	
	DOM.chatHistory.classList.remove('hidden');
	DOM.friendsList.classList.add('hidden');
	DOM.blockedList.classList.add('hidden');
	DOM.requestsList.classList.add('hidden');
	activeMenu = "Chats";
	DOM.friendsMenuExtension.classList.add('hidden');
	DOM.chatsNotification.classList.add('hidden');
	DOM.searchBar.classList.add('mb-4');
	DOM.liveChatNotification.classList.add('hidden');
	DOM.findUser.classList.add('hidden');
	activeHeaderMenu = "LiveChat";
}


DOM.searchBar.addEventListener('focusout', (e) => {
	DOM.searchList.classList.add('hidden');
	DOM.searchResults.classList.add('hidden');
	DOM.searchBar.value = "";
	DOM.searchList.replaceChildren();
	DOM.noResults.classList.add('hiiden');
	DOM.findUser.classList.add('hidden');

	// const clicked = (e.relatedTarget as HTMLElement);
	// if (sideBarMenu.contains(clicked) || friendsMenuExtension.contains(clicked))
	// {
	// 	console.log("It actually works");
	// 	return;
	// }

	DOM.noChats.classList.add('hidden');
	DOM.noFriends.classList.add('hidden');
	DOM.noBlocked.classList.add('hidden');
	DOM.noRequests.classList.add('hidden');

	if (activeMenu.match("Chats"))
	{
		DOM.chatHistory.classList.remove('hidden');
		if (!DOM.chatHistory.children.length) DOM.noChats.classList.remove('hidden');
	}
	if (activeMenu.match("Friends"))
	{
		if (activeExMenu.match("All"))
		{
			DOM.friendsList.classList.remove('hidden');
			if (!DOM.friendsList.children.length)
				DOM.noFriends.classList.remove('hidden');
		}
		else if (activeExMenu.match("Blocked"))
		{
			DOM.blockedList.classList.remove('hidden');
			if (!DOM.blockedList.children.length)
				DOM.noBlocked.classList.remove('hidden');
		}
		else
		{
			DOM.requestsList.classList.remove('hidden');
			if (!DOM.requestsList.children.length)
				DOM.noRequests.classList.remove('hidden');
		}
	}
	if (activeMenu.match("Users"))
		DOM.findUser.classList.remove('hidden');
});

DOM.searchBar.addEventListener('input', () => {
	DOM.chatHistory.classList.add('hidden');
	DOM.friendsList.classList.add('hidden');
	DOM.blockedList.classList.add('hidden');
	DOM.requestsList.classList.add('hidden');
	DOM.searchResults.classList.remove('hidden');
	DOM.searchList.classList.remove('hidden');
	DOM.searchInfo.innerHTML = "Search results"
	DOM.findUser.classList.add('hidden');
	DOM.noResults.classList.add('hidden');
	DOM.noChats.classList.add('hidden');
	DOM.noFriends.classList.add('hidden');
	DOM.noBlocked.classList.add('hidden');
	DOM.noRequests.classList.add('hidden');
	
	
	let list = DOM.chatHistory.querySelectorAll('li');
	let currentMenuContent = DOM.chatHistory;
	
	if (activeMenu.match("Friends"))
	{
		list = activeExMenu.match("All") ? DOM.friendsList.querySelectorAll('li')
			: activeExMenu.match("Blocked") ? DOM.blockedList.querySelectorAll('li')
			: DOM.requestsList.querySelectorAll('li');
		
		// To display back the list that was active, when search bar is empty
		currentMenuContent = activeExMenu.match("All") ? DOM.friendsList
			: activeExMenu.match("Blocked") ? DOM.blockedList
			: DOM.requestsList;
	}
	if (activeMenu.match("Users"))
	{
		if (DOM.searchBar.value !== "")
		{
			DOM.searchList.replaceChildren();
			DOM.findUser.classList.add('hidden');
			DOM.searchResults.classList.remove('hidden');
			searchUsers(DOM.searchBar.value);
		}
		else
		{
			DOM.findUser.classList.remove('hidden');
			DOM.searchResults.classList.add('hidden');
		}
		return;
	}

	let matchFound = 0;
	DOM.searchList.replaceChildren();
	list.forEach(element => {
		if (element.dataset.username?.toLowerCase().match(DOM.searchBar.value.toLowerCase()) && DOM.searchBar.value!== "")
		{
			// Creating a link to the original element for requests notification management
			const clone = element.cloneNode(true) as HtmlLIClone;
			clone.original = element;
			DOM.searchList.appendChild(clone);
			matchFound++;
		}
	});
	
	if (!matchFound)
	{
		DOM.searchBar.value === ""
		? (DOM.searchResults.classList.add('hidden'),
			currentMenuContent.classList.remove('hidden'))
		: DOM.noResults.classList.remove('hidden');
	}
});

DOM.sideBarMenu.addEventListener('click', (e) => {
	const target = (e.target as HTMLElement).closest("button");
	
	if (!target) return;
	
	const elements = DOM.sideBarMenu.querySelectorAll('button');
	elements.forEach(element => {
		element.classList.remove('neon-text-blue');
	});
	target.classList.add('neon-text-blue');
	
	
	// elementsEx -> To reset Friends Menu Extension to default selection (All)
	const elementsEx = DOM.friendsMenuExtension.querySelectorAll('button');
	elementsEx.forEach(element => {
			element.classList.remove('neon-text-blue', 'border', 'border-zinc-400', 'bg-gray-800');
	});
	elementsEx.forEach(element => {
		if (element.innerText.match("All"))
			element.classList.add('neon-text-blue', 'border', 'border-zinc-400', 'bg-gray-800');
	});
	activeExMenu = "All";
	DOM.noChats.classList.add('hidden');
	DOM.noFriends.classList.add('hidden');
	DOM.noBlocked.classList.add('hidden');
	DOM.noRequests.classList.add('hidden');

	DOM.chatHistory.classList.add('hidden');
	DOM.blockedList.classList.add('hidden');
	DOM.requestsList.classList.add('hidden');
	DOM.friendsList.classList.add('hidden');
	

	if (target.innerText.match("Chats"))
	{
		activeMenu = "Chats";
		DOM.chatHistory.classList.remove('hidden');
		DOM.friendsMenuExtension.classList.add('hidden');
		DOM.chatsNotification.classList.add('hidden');
		DOM.searchBar.classList.add('mb-4');
		DOM.findUser.classList.add('hidden');
		DOM.chatHistory.scrollTop = 0;
		if (!DOM.chatHistory.children.length) DOM.noChats.classList.remove('hidden');
		else DOM.noChats.classList.add('hidden');
		// addChatHistory("Tournament System", "default", "Test message", 0, 1, "append");
		// addChatHistory("Test user", "default", "Test user message", 500, 1, "append");
		
		// addChatHistory("Tom Smithgewgwegewewbvuygukgyuguygfuyfffuyfyfyufug", null, "Very long message preview"); // TO DELETE !!!!!!
		// addChatHistory("James", null, "Last message preview", 1); // TO DELETE !!!!!!
	}
	
	if (target.innerText.match("Friends"))
	{
		activeMenu = "Friends";
		DOM.friendsList.classList.remove('hidden');
		DOM.friendsMenuExtension.classList.remove('hidden');
		DOM.searchBar.classList.remove('mb-4');
		DOM.findUser.classList.add('hidden');
		DOM.friendsList.scrollTop = 0;
		DOM.friendsNotification.classList.add('hidden');
		if (!DOM.friendsList.children.length)
			DOM.noFriends.classList.remove('hidden');
		else
			DOM.noFriends.classList.add('hidden');
		// addElementToList(DOM.friendsList, "Jack", null, 11, ""); // TO DELETE !!!!!!
		// addElementToList(DOM.blockedList, "John", null, 12, ""); // TO DELETE !!!!!!
		// addElementToList(DOM.requestsList, "Mark", null, 13, "not viewed"); // TO DELETE !!!!!!
		
	}
	
	if (target.innerText === "Users")
	{
		DOM.searchBar.focus();
		DOM.friendsMenuExtension.classList.add('hidden');
		DOM.searchBar.classList.add('mb-4');
		DOM.findUser.classList.remove('hidden');
		activeMenu = "Users";
	}
});

DOM.friendsMenuExtension.addEventListener('click', (e) => {
	const target = (e.target as HTMLElement).closest("button");
	
	if (!target) return;
	
	const elements = DOM.friendsMenuExtension.querySelectorAll('button');
	
	elements.forEach(element => {
		element.classList.remove('neon-text-blue', 'border', 'border-zinc-400', 'bg-gray-800');
	});
	
	target.classList.add('neon-text-blue', 'border', 'border-zinc-400', 'bg-gray-800');
	
	DOM.blockedList.classList.add('hidden');
	DOM.requestsList.classList.add('hidden');
	DOM.friendsList.classList.add('hidden');

	DOM.noChats.classList.add('hidden');
	DOM.noFriends.classList.add('hidden');
	DOM.noBlocked.classList.add('hidden');
	DOM.noRequests.classList.add('hidden');	
	
	if (target.innerText.match("All"))
	{
		console.log('Friends children:', DOM.friendsList.children.length, DOM.friendsList.innerHTML);

		DOM.friendsList.classList.remove('hidden');
		DOM.friendsList.scrollTop = 0;
		if (!DOM.friendsList.children.length)
			DOM.noFriends.classList.remove('hidden');
		else
			DOM.noFriends.classList.add('hidden');
	}
	
	else if (target.innerText.match("Blocked"))
	{
		DOM.blockedList.classList.remove('hidden');
		DOM.blockedList.scrollTop = 0;
		if (!DOM.blockedList.children.length)
			DOM.noBlocked.classList.remove('hidden');
		else
			DOM.noBlocked.classList.add('hidden');
	}
	
	else if (target.innerText.match("Requests"))
	{
		DOM.requestsList.classList.remove('hidden');
		DOM.requestsNotification.classList.add('hidden');
		DOM.friendsNotification.classList.add('hidden');
		DOM.requestsList.scrollTop = 0;
		if (!DOM.requestsList.children.length)
			DOM.noRequests.classList.remove('hidden');
		else
			DOM.noRequests.classList.add('hidden');
	}
	
	activeExMenu = target.innerText;
});

function updateHeaderInfo(target: HTMLLIElement | null)
{
	if (currentTargetID === tournamentID)
	{
		DOM.chatHeader.classList.add('hidden');
		DOM.tournamentHeader.classList.remove('hidden');
		return;
	}
	
	DOM.chatHeader.classList.remove('hidden');
	DOM.tournamentHeader.classList.add('hidden');
	// this needs some minor changes :D
	if (target && target.dataset.username)
	{
		const name = target.dataset.username;
		const picSrc = target.dataset.picSrc!;
		
		console.log("AVATAR PATH : ", picSrc);
		DOM.headerName.innerHTML = name;
		if (name.length > 24)
		{
			let extracted: string = name.substring(0, 21);
			while (extracted.endsWith(" ") || extracted.endsWith("\n") || extracted.endsWith("\t"))
				extracted = extracted.slice(0, -1);
			extracted = extracted + "...";
			DOM.headerName.innerHTML = extracted;
		}
		DOM.headerPic.src = picSrc;
		// if (DOM.headerPic.src.match("none")) DOM.headerPic.classList.add('hidden');
		DOM.headerPic.classList.remove('hidden');
	}
}

function addElementToList(list: HTMLUListElement, name: string, picSrc: string, id: number, status: string)
{
	const SVG_NS = "http://www.w3.org/2000/svg";
	const resultElement = document.createElement('li');
	const wholeBox = document.createElement('div');
	const div = document.createElement('div');
	const profilePic = document.createElement('img');
	// const defaultProfilePic = document.createElementNS(SVG_NS, 'svg');
	const profileName = document.createElement('p');
	// const circle = document.createElementNS(SVG_NS, 'circle');
	// const path = document.createElementNS(SVG_NS, 'path');
	const notificationIcon = document.createElement('div');
	const separationLine = document.createElement('div');
	const defaultAvatarPath = "/imgs/avatars/default.png"; // MAYBE?
	
	resultElement.className = "flex flex-col hover:bg-slate-500 hover:bg-opacity-20 cursor-pointer";
	wholeBox.className = "flex items-center p-2";
	div.className = "w-8 h-8 rounded-full overflow-hidden bg-white";
	profilePic.className = "list-profile-pic w-full h-full object-cover hidden";
	profilePic.src = (picSrc === "default") ? defaultAvatarPath : picSrc;
	profilePic.classList.remove('hidden');
	profilePic.alt = "Profile pic";
	// defaultProfilePic.setAttribute("class", "w-full h-full fill-pink-400");
	// defaultProfilePic.setAttribute("viewBox", "0 0 64 64");
	// circle.setAttribute("cx", "32");
	// circle.setAttribute("cy", "20");
	// circle.setAttribute("r", "12");
	// path.setAttribute("d", "M12 52c0-11 9-20 20-20s20 9 20 20");
	profileName.className = "list-profile-name ml-3 font-bold text-[15px] max-w-40 whitespace-nowrap overflow-hidden text-ellipsis";
	profileName.innerHTML = name;
	notificationIcon.className = "notification-dot w-3 h-3 ml-auto mr-3 rounded-full notification-dot-color";
	separationLine.className = "ml-14 border-b-[0.5px] border-gray-600";
	
	
	resultElement.appendChild(wholeBox);
	wholeBox.appendChild(div);
	div.appendChild(profilePic);
	// div.appendChild(defaultProfilePic);
	// defaultProfilePic.appendChild(circle);
	// defaultProfilePic.appendChild(path);
	wholeBox.appendChild(profileName);
	// resultElement.appendChild(separationLine);
	
	resultElement.dataset.id = String(id);
	resultElement.dataset.username = name;
	resultElement.dataset.picSrc = profilePic.src;

	if (list === DOM.requestsList && status === "not viewed")
		wholeBox.appendChild(notificationIcon);

	if (list === DOM.friendsList) DOM.noFriends.classList.add('hidden');
	if (list === DOM.blockedList) DOM.noBlocked.classList.add('hidden');
	if (list === DOM.requestsList) DOM.noRequests.classList.add('hidden');

	list.appendChild(resultElement);
}

export function addChatHistory(name: string, picSrc: string, lastMsg: string, target_id: number, unread_amount: number, option: string, type: string = "msg")
{
	const SVG_NS = "http://www.w3.org/2000/svg";
	const chatElement = document.createElement('li');
	const wholeBox = document.createElement('div');
	const div = document.createElement('div');
	const profilePic = document.createElement('img');
	// const defaultProfilePic = document.createElementNS(SVG_NS, 'svg');
	const chatMsgInfo = document.createElement('div');
	const profileName = document.createElement('p');
	const msgPreview = document.createElement('p');
	// const circle = document.createElementNS(SVG_NS, 'circle');
	// const path = document.createElementNS(SVG_NS, 'path');
	const notificationIcon = document.createElement('div');
	const separationLine = document.createElement('div');
	const defaultAvatarPath = "/imgs/avatars/default.png"; // MAYBE?
	
	chatElement.className = "flex flex-col hover:bg-slate-500 hover:bg-opacity-20 cursor-pointer";
	wholeBox.className = "flex items-center p-2";
	div.className = "w-9 h-9 rounded-full overflow-hidden bg-white";
	profilePic.className = "list-profile-pic w-full h-full object-cover hidden";
	profilePic.src = (picSrc === "default") ? defaultAvatarPath : picSrc;
	profilePic.classList.remove('hidden');
	profilePic.alt = "Profile pic";
	// defaultProfilePic.setAttribute("class", "w-full h-full fill-pink-400");
	// defaultProfilePic.setAttribute("viewBox", "0 0 64 64");
	// circle.setAttribute("cx", "32");
	// circle.setAttribute("cy", "20");
	// circle.setAttribute("r", "12");
	// path.setAttribute("d", "M12 52c0-11 9-20 20-20s20 9 20 20");
	chatMsgInfo.className = "flex flex-col max-w-40";
	profileName.className = "list-profile-name ml-3 font-bold text-[15px] whitespace-nowrap overflow-hidden text-ellipsis";
	msgPreview.className = "msg-preview ml-3 text-[13px] -mt-1 whitespace-nowrap overflow-hidden text-ellipsis";
	profileName.innerHTML = name;
	msgPreview.innerHTML = lastMsg;
	notificationIcon.className = "notification-dot flex h-[18px] min-w-[18px] max-w-fit ml-auto mr-2 p-1 justify-center items-center rounded-full text-xs font-bold notification-dot-color";
	notificationIcon.classList.toggle('hidden', unread_amount === 0);
	notificationIcon.innerHTML = unread_amount > 99 ? "99+" : String(unread_amount);
	separationLine.className = "ml-14 border-b-[0.5px] border-gray-600";

	
	chatElement.appendChild(wholeBox);
	
	if (type === "invitation")
		msgPreview.classList.add('text-yellow-300', 'italic', 'font-semibold');
	if (target_id === tournamentID)
	{
		div.className = "w-9 h-9 flex justify-center items-center text-yellow-400 text-2xl font-bold rounded-full bg-slate-700";
		div.innerHTML = "T";
		wholeBox.appendChild(div);
	}
	else
	{
		wholeBox.appendChild(div);
		div.appendChild(profilePic);
		// div.appendChild(defaultProfilePic);
		// defaultProfilePic.appendChild(circle);
		// defaultProfilePic.appendChild(path);
	}
	
	chatMsgInfo.appendChild(profileName);
	chatMsgInfo.appendChild(msgPreview);
	wholeBox.appendChild(chatMsgInfo);
	wholeBox.appendChild(notificationIcon);
	// chatElement.appendChild(separationLine);
	
	chatElement.dataset.id = String(target_id);
	chatElement.dataset.username = name;
	chatElement.dataset.picSrc = profilePic.src;
	
	// DOM.noChats.remove(); // Same as DOM.chatHistory.removeChild(DOM.noChats) - if it's not there, nothing happens - safe
	DOM.noChats.classList.add('hidden');
	if (option === "prepend")
		DOM.chatHistory.prepend(chatElement);
	else
		DOM.chatHistory.appendChild(chatElement);
	
	console.log("Added chat with name: %s id: %d", name, target_id);
}

DOM.friendsList.addEventListener("mousedown", (e) => {
	const target = (e.target as HTMLLIElement).closest("li");
	
	if (!target || !DOM.friendsList.contains(target)) return;
	
	currentTargetID = Number(target.dataset.id);
	console.log("currentTargetID: %d   <-- friendsList", currentTargetID);
	updateHeaderInfo(target);
	closeChat();
	DOM.infoTitle.classList.add('hidden');

	// DOM.tournamentMainChatArea.classList.add('hidden');
	DOM.chatMainArea.classList.remove('hidden');
	
	// Checks if blocked/blockedBy/noBlock
	handleUserKinds();
});

DOM.blockedList.addEventListener("mousedown", (e) => {
	const target = (e.target as HTMLLIElement).closest("li");
	
	if (!target || !DOM.blockedList.contains(target)) return;
	
	currentTargetID = Number(target.dataset.id);
	console.log("currentTargetID: %d   <-- blockedList", currentTargetID);
	updateHeaderInfo(target);
	closeChat();
	DOM.infoTitle.classList.add('hidden');
	
	// DOM.tournamentMainChatArea.classList.add('hidden');
	DOM.chatMainArea.classList.remove('hidden');
	showOptions(DOM.friendsMenuExBlockedOptions);
});

DOM.requestsList.addEventListener("mousedown", (e) => {
	const target = (e.target as HTMLLIElement).closest("li");
	
	if (!(target && target.dataset.username)
		|| !(DOM.requestsList.contains(target))) return;
	
	currentTargetID = Number(target.dataset.id);
	console.log("currentTargetID: %d   <-- requestsList", currentTargetID);
	updateHeaderInfo(target);
	closeChat();
	DOM.infoTitle.classList.add('hidden');

	// DOM.tournamentMainChatArea.classList.add('hidden');
	DOM.chatMainArea.classList.remove('hidden');
	DOM.requesterID.innerHTML = target.dataset.username;
	showOptions(DOM.friendsMenuExRequestsOptions);
	
	const notification = target.querySelector('.notification-dot') as HTMLDivElement;
	if (!notification.classList.contains('hidden'))
	{
		notification.classList.add('hidden');
		markRequestAsViewed(currentTargetID);
	}
});

DOM.searchList.addEventListener("mousedown", (e) => {
	const target = (e.target as HTMLLIElement).closest("li") as HtmlLIClone;
	
	if (!(target && target.dataset.username)) return;
	
	e.preventDefault();
	currentTargetID = Number(target.dataset.id);
	console.log("currentTargetID: %d   <-- searchList", currentTargetID);
	updateHeaderInfo(target);
	DOM.infoTitle.classList.add('hidden');
	
	// That will have to be removed when Tournament is made as Friend
	// DOM.tournamentMainChatArea.classList.add('hidden');
	DOM.chatMainArea.classList.remove('hidden');
	
	if (activeMenu.match("Chats"))
	{
		openChat();
		return;
	}
	
	closeChat();
	// Could do everywhere handleUserKinds(), the only thing is, it would always call db
	// which would be a little heavier, right now there is 50/50 chance it won't
	if (activeMenu.match("Friends"))
	{
		// handleUserKinds() cause it checks if block/blockedBy/noBlock and displays correct options
		if (activeExMenu.match("All"))
			handleUserKinds();
		else if (activeExMenu.match("Blocked"))
			showOptions(DOM.friendsMenuExBlockedOptions);
		else
		{
			DOM.requesterID.innerHTML = target.dataset.username;
			showOptions(DOM.friendsMenuExRequestsOptions);
			
			// If the request is being viewed for the first time I'm hiding notification icon
			// and mark request as viewed in db. It's in if statement only because
			// markRequestAsViewed() calls db and I don't want it to happen if not necessary
			if (!target.querySelector('.notification-dot')?.classList.contains('hidden'))
			{
				target.querySelector('.notification-dot')?.classList.add('hidden');
				target.original.querySelector('.notification-dot')?.classList.add('hidden');
				markRequestAsViewed(currentTargetID);
			}
		}
	}
	// ------- When click on result while searching in Users ------
	else
		handleUserKinds();
});

DOM.chatHistory.addEventListener("click", (e) => {
	const target = (e.target as HTMLLIElement).closest("li");
	
	if (!target) return;
	// if (target.hasAttribute('id'))
	// {
	// 	// Make Tournament as a friend, create right after creating database and give it users.id = 1
	// 	// Then add check to not return it as a User when searching 
	// 	// And check to not return as a friend while loading friendsList
	// 	// Aaand in manageChatFooter() add check for -> if Tournament
	// 	DOM.chatMainArea.classList.add('hidden');
	// 	// DOM.tournamentMainChatArea.classList.remove('hidden');
	// 	target.querySelector('.notification-dot')?.classList.add('hidden');
	// 	return;
	// }
	
	currentTargetID = Number(target.dataset.id);
	console.log("currentTargetID: %d   <-- chatHistory", currentTargetID);
	updateHeaderInfo(target);
	openChat();
});



// ---- Database related functions ----
async function searchUsers(input: string)
{
	const result = await chatSocket.searchDbUsers(input);
	
	if (result.length > 0)
	{
		DOM.noResults.classList.add('hidden');
		result.forEach(e => {
			addElementToList(DOM.searchList, e.nickname, e.avatar, e.id, "");
		})
	}
	else
		DOM.noResults.classList.remove('hidden');
}

async function getChatHistory()
{
	const chats = await chatSocket.loadChats();
	let unread: boolean = false;
	
	DOM.chatHistory.replaceChildren()
	if (chats.length > 0)
	{
		chats.forEach(chat => {
			addChatHistory(chat.nickname, chat.avatar, chat.message, chat.id, chat.amount, "append");
			if (chat.amount)
				unread = true;
		})
	}
	else
		DOM.noChats.classList.remove('hidden');

	if (unread && window.location.pathname !== "/livechat")
		DOM.liveChatNotification.classList.remove('hidden');

	console.log("Was getting the chats - length: ", chats.length);
}

export async function getFriendsAll()
{
	const friends = await chatSocket.searchDbFriendships();
	
	DOM.friendsList.replaceChildren();
	if (friends.length > 0)
	{
		friends.forEach(friend => {
			addElementToList(DOM.friendsList, friend.nickname, friend.avatar, friend.id, "");
		})
	}
	// else
	// 	DOM.friendsList.appendChild(DOM.noFriends);
}

export async function getFriendsBlocked()
{
	const blocked = await chatSocket.searchDbBlocked();
	
	DOM.blockedList.replaceChildren();
	if (blocked.length > 0)
	{
		blocked.forEach(user => {
			addElementToList(DOM.blockedList, user.nickname, user.avatar, user.id, "")
		})
		// DOM.noBlocked.classList.add('hidden');
	}
	// else
		// DOM.blockedList.appendChild(DOM.noBlocked);
		// DOM.noBlocked.classList.remove('hidden');
}

async function getFriendsRequests()
{
	const requests = await chatSocket.searchDbRequests();
	
	DOM.requestsList.replaceChildren();
	if (requests.length > 0)
	{
		requests.forEach(requester => {
			addElementToList(DOM.requestsList, requester.nickname, requester.avatar, requester.id, requester.status);
		})
	}
	// else
	// 	DOM.requestsList.appendChild(DOM.noRequests);
}

async function handleUserUnknown(id: number)
{
	const requestStatus = await chatSocket.checkRequestSent(id);
	
	if (requestStatus === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	if (requestStatus === "sent")
	{
		DOM.addFriendBtn.classList.add('hidden');
		DOM.requestSentInfo.classList.remove('hidden');
	}
	else
	{
		DOM.addFriendBtn.classList.remove('hidden');
		DOM.requestSentInfo.classList.add('hidden');
	}
	
	showOptions(DOM.usersMenuOptions);
}

async function handleUserKinds()
{
	const status = await chatSocket.checkBlocks(currentTargetID);
	
	if (status === "error")
	{
		alert("Something went wrong. Please try again later");
		return;
	}
	
	if (status === "mutual block" || status === "target blocked")
		showOptions(DOM.friendsMenuExBlockedOptions);
	else if (status === "blocked by target")
		showOptions(DOM.blockedByUserOptions);
	else if (status === "no blocks")
		showOptions(DOM.friendsMenuOptions);
	else if (status === "not friends")
	{
		const requested = DOM.requestsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
		if (requested)
		{
			DOM.requesterID.innerHTML = requested.dataset.username!;
			showOptions(DOM.friendsMenuExRequestsOptions);
			markRequestAsViewed(currentTargetID);
			getFriendsRequests();
			return;
		}
		handleUserUnknown(currentTargetID);
	}
}

// This is only for notification icon
async function markRequestAsViewed(from_id: number)
{
	await chatSocket.updateRequestStat(from_id);
}

export async function closeChat()
{
	chatSocket.emit("update chat and target info", currentTargetID, "targetID");
	DOM.chatMsgArea.classList.add('hidden');
	DOM.chatFooter.classList.add('hidden');
	DOM.chatFooterBlocked.classList.add('hidden');
	DOM.chatOptionsBtn.classList.add('hidden');

	DOM.goToBottomIcon.classList.remove("opacity-100");
	DOM.goToBottomIcon.classList.add("opacity-0");
	DOM.goToBottomIcon.classList.add('pointer-events-none');
	resetGoToBottomMsgCount();
	
	// I am using it here, because almost every time I use closeChat(),
	// targetID changes, so it's just convenient
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



// ---- Socket event handlers ---- 


// NOTES:
// - When request is accepted, show notification next to new friend at put it on top until viewed?

function RegisterSocketListeners()
{
	// When someone sends you request
	chatSocket.on("received request", (from_id: number) => {
		getFriendsRequests();
		if (window.location.pathname !== "/livechat")
			DOM.liveChatNotification.classList.remove('hidden');
		
		if (!activeMenu.match("Friends") && currentTargetID !== from_id)
			DOM.friendsNotification.classList.remove('hidden');
		
		if (!activeExMenu.match("Requests") && currentTargetID !== from_id)
			DOM.requestsNotification.classList.remove('hidden');
		
		// When you have this users window open and they send you request
		if (currentTargetID === from_id)
		{
			DOM.requesterID.innerHTML = DOM.headerName.innerHTML;
			showOptions(DOM.friendsMenuExRequestsOptions);
		}
	});

	// When your request gets accepted 
	chatSocket.on("your request is accepted", (target_id: number) => {
		// if you still had the window open
		if (currentTargetID === target_id)
			showOptions(DOM.friendsMenuOptions);
		
		getFriendsAll();
		
		const request = DOM.requestsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
		if (request)
			request.remove();
		if (!DOM.requestsList.children.length && activeMenu === "Friends" && activeExMenu === "Requests")
			DOM.noRequests.classList.remove('hidden');
	});

	// When your request gets declined 
	chatSocket.on("your request is declined", (target_id: number) => {
		// if you still had the window open
		if (currentTargetID === target_id)
		{
			DOM.addFriendBtn.classList.remove('hidden');
			DOM.requestSentInfo.classList.add('hidden');
		}

		const request = DOM.requestsList.querySelector(`li[data-id="${currentTargetID}"]`) as HTMLLIElement | null;
		if (request)
			request.remove();
		if (!DOM.requestsList.children.length && activeMenu === "Friends" && activeExMenu === "Requests")
			DOM.noRequests.classList.remove('hidden');
	});


	// !!!!!! FROM NOW ON A CHAT WINDOW OR CHAT OPTIONS COULD BE OPEN !!!!!!!

	// When you get removed from friends
	chatSocket.on("got removed from friends", (by_id: number) => {
		if (currentTargetID === by_id)
		{
			closeChat();
			DOM.addFriendBtn.classList.remove('hidden');
			DOM.requestSentInfo.classList.add('hidden');
			showOptions(DOM.usersMenuOptions);
		}
		
		const chat = DOM.chatHistory.querySelector(`li[data-id="${by_id}"]`) as HTMLLIElement | null;
		if (chat)
			chat.remove();
		if (!DOM.chatHistory.children.length && activeMenu === "Chats")
			DOM.noChats.classList.remove('hidden');

		// Remove from friends list
		const friend = DOM.friendsList.querySelector(`li[data-id="${by_id}"]`) as HTMLLIElement | null;
		if (friend)
			friend.remove();
		if (!DOM.friendsList.children.length && activeMenu === "Friends" && activeExMenu === "All")
			DOM.noFriends.classList.remove('hidden');
		
		// Remove from blocked list
		const blocked = DOM.blockedList.querySelector(`li[data-id="${by_id}"]`) as HTMLLIElement | null;
		if (blocked)
			blocked.remove();
		if (!DOM.blockedList.children.length && activeMenu === "Friends" && activeExMenu === "Blocked")
			DOM.noBlocked.classList.remove('hidden');
	});

	chatSocket.on("you got blocked", (by_id: number) => {
		
		// Only matters if you haven't block this user before, otherwise
		// blockedOptions are already there and take priority
		if (currentTargetID === by_id)
		{
			DOM.gameInviteBanner.classList.add('hidden');
			chatSocket.removeInvitation("received");
			chatSocket.removeInvitation("sent");
			manageInviteBtnStatus(currentOptionsWindow);

			// If chat window is open
			if (!DOM.chatMsgArea.classList.contains('hidden'))
				manageChatFooter();
			else if (currentOptionsWindow === DOM.chatsMenuOptions)
				showOptions(DOM.chatsMenuBlockedByOptions);
			else if (currentOptionsWindow == DOM.friendsMenuOptions)
				showOptions(DOM.blockedByUserOptions);
		}
	});

	chatSocket.on("you got unblocked", (by_id: number) => {
		
		// Same as in "you got blocked" --> if you blocked other user anyway
		// BlockedOptions take priority, so we check only if there was blockedBy
		if (currentTargetID === by_id)
		{
			// If chat window is open
			if (!DOM.chatMsgArea.classList.contains('hidden'))
				manageChatFooter();
			else if (currentOptionsWindow === DOM.chatsMenuBlockedByOptions)
				showOptions(DOM.chatsMenuOptions);
			else if (currentOptionsWindow === DOM.blockedByUserOptions)
				showOptions(DOM.friendsMenuOptions);
		}
	});

	// This event comes when the chat is open
	chatSocket.on("received message", (from_id: number, name: string, avatar: string, msg: string, timeDbFormat: string) => {
		// Double check, theoretically unnecessary
		// Cause server emits this event only when chat is open
		if (currentTargetID === from_id)
		{
			if (window.location.pathname !== "/livechat")
				DOM.liveChatNotification.classList.remove('hidden');
			const timeHM = convertISOtoLocaleHM(timeDbFormat);
			const bottomMsg = DOM.chatMsgArea.lastChild as HTMLDivElement | null;
			let prevMsgType = bottomMsg ? (bottomMsg.classList.contains("self-end") ? "sent" : "received") : "none";
			
			if (prevMsgType === "none") // Very first message in chat (lastMsgDateISO is empty)
					displayDateTag(timeDbFormat, timeDbFormat, "append", true);
			else
				prevMsgType = displayDateTag(lastMsgDateISO, timeDbFormat, "append") ? "none" : prevMsgType;
				
			updateLastMsgDateISO(timeDbFormat); // Update last msg date
			displayMessage("received", msg, "append", timeHM, prevMsgType);
			
			// User has scrolled up to older messages - display count of new msgs they received
			if (DOM.goToBottomIcon.classList.contains("opacity-100"))
			{
				DOM.newMsgsCount.innerHTML = msgsOnScrollCount === 99 ? "99+" : String(++msgsOnScrollCount);
				DOM.newMsgsCount.classList.remove('hidden');
				DOM.goToBottomIcon.classList.remove('pointer-events-none');
			}
			else
				DOM.chatMsgArea.scrollTop = DOM.chatMsgArea.scrollHeight;
			
			const currentChat = DOM.chatHistory.querySelector(`li[data-id="${currentTargetID}"]`);
			
			// It could be that it's an open chat from newly added friend (so no chat history yet) 
			if (!currentChat)
				addChatHistory(name, avatar, msg, from_id, 0, "prepend"); // In this function I check if it was tournamentID
			else
			{
				const msgPreview = currentChat.querySelector('.msg-preview') as HTMLParagraphElement;
				msgPreview.classList.remove('text-yellow-300', 'italic', 'font-semibold'); // Reset from game style to normal message
				msgPreview.innerHTML = msg;
				DOM.chatHistory.prepend(currentChat!);
			}
		}
	});

	// When message comes, but chat is not open
	chatSocket.on("update notification", (from_id: number, name: string, avatar: string, lastMsgPreview: string, unread_amount: number) => {
		if (activeMenu !== "Chats")
			DOM.chatsNotification.classList.remove('hidden');
		if (window.location.pathname !== "/livechat")
			DOM.liveChatNotification.classList.remove('hidden');
		
		const target = DOM.chatHistory.querySelector(`li[data-id="${from_id}"]`) as HTMLLIElement | null;
		if (!target)
			addChatHistory(name, avatar, lastMsgPreview, from_id, unread_amount, "prepend");
		else
		{
			const notification = target.querySelector('.notification-dot') as HTMLDivElement;
			notification.classList.remove("hidden");
			notification.innerHTML = unread_amount > 99 ? "99+" : String(unread_amount);
			const msgPreview = target.querySelector('.msg-preview') as HTMLParagraphElement;
			msgPreview.innerHTML = lastMsgPreview;
			msgPreview.classList.remove('text-yellow-300', 'italic', 'font-semibold'); // Reset from game style to normal message
			DOM.chatHistory.prepend(target);
		}
	});
	
	chatSocket.on("bye bye", (from_id: number) => {
		if (currentTargetID === from_id)
		{
			DOM.statusDot.classList.remove('bg-green-500');
			DOM.statusDot.classList.add('bg-red-600');
			DOM.onlineStatus.innerHTML = "Offline";
			DOM.userProfileStatus.innerHTML = "Offline";
			manageInviteBtnStatus(currentOptionsWindow, "offline");
		}
	});
	
	chatSocket.on("i am online", (target_id: number) => {
		if (currentTargetID === target_id)
		{
			DOM.statusDot.classList.remove('bg-red-600');
			DOM.statusDot.classList.add('bg-green-500');
			DOM.onlineStatus.innerHTML = "Online";
			DOM.userProfileStatus.innerHTML = "Online";
			manageInviteBtnStatus(currentOptionsWindow, "online");
		}
	});
	
	chatSocket.on("received game invitation", (from_id:number, nickname: string, avatar: string) => {
		if (currentTargetID === from_id)
		{
			if (window.location.pathname !== "/livechat")
				DOM.liveChatNotification.classList.remove('hidden');
			const currentChat = DOM.chatHistory.querySelector(`li[data-id="${currentTargetID}"]`);
			
			// It could be that it's an open chat from newly added friend (so no chat history yet) 
			if (!currentChat)
				addChatHistory(nickname, avatar, "Game Invitation", from_id, 0, "prepend"); // In this function I check if it was tournamentID
			
			DOM.gameInviteFrom.innerHTML = nickname;
			DOM.gameInviteBanner.classList.remove('hidden');
			manageInviteBtnStatus(currentOptionsWindow);
		}
	});
	
	chatSocket.on("update notification - game", (from_id: number, name: string, avatar: string) => {
		if (activeMenu !== "Chats")
			DOM.chatsNotification.classList.remove('hidden');
		if (window.location.pathname !== "/livechat")
			DOM.liveChatNotification.classList.remove('hidden');
		
		const target = DOM.chatHistory.querySelector(`li[data-id="${from_id}"]`) as HTMLLIElement | null;
		if (!target)
			addChatHistory(name, avatar, "Game Invitation", from_id, 0, "prepend", "invitation");
		else
		{
			const notification = target.querySelector('.notification-dot') as HTMLDivElement;
			// notification.classList.remove("hidden");
			// notification.innerHTML = unread_amount > 99 ? "99+" : String(unread_amount);
			const msgPreview = target.querySelector('.msg-preview') as HTMLParagraphElement;
			msgPreview.classList.add('text-yellow-300', 'italic', 'font-semibold');
			msgPreview.innerHTML = "Game Invitation";
			DOM.chatHistory.prepend(target);
		}
	});
	
	chatSocket.on("invitation declined", (by_id: number) => {
		if (currentTargetID === by_id)
		{
			// Reset Invite Btn State if options window is open
			const inviteBtnCurrent = currentOptionsWindow.querySelector('.invite-to-play-btn');
			if (inviteBtnCurrent)
			{
				const btnInfo = inviteBtnCurrent.querySelector('span');
				if (btnInfo)
					inviteBtnCurrent.removeChild(btnInfo);
				inviteBtnCurrent.classList.remove("text-yellow-300", "text-opacity-50", "pointer-events-none");
				inviteBtnCurrent.classList.add("neon-text-yellow", "neon-border-pink", "hover:neon-bg-pink", "hover:text-black");
			}
		}
	});
	
	chatSocket.on("invitation canceled", (by_id: number) => {
		if (currentTargetID === by_id) // doesn't matter if in chat, but cannot hide someone elses
			DOM.gameInviteBanner.classList.add('hidden');
	});

	chatSocket.on("can you play", (from_id: number) => {
		const socketManager = SocketManager.getInstance();
		const existingGame = socketManager.getGameInstance();

		const status = (existingGame && existingGame.gameRunning) ? "not available" : "available";
		
		chatSocket.emit("status response", status, from_id); // responding with from_id so server knows where to send response
	});

	chatSocket.on("received player status", (status: string) => {
		// At this point invitation was accepted and the sender is either already playing with someone or is available - in both cases reset invitation
		chatSocket.removeInvitation("received");
		chatSocket.removeInvitation("sent");
		manageInviteBtnStatus(currentOptionsWindow);

		if (status === "not available")
		{
			DOM.feedbackFrom.innerHTML = DOM.headerName.innerHTML;
			DOM.feedbackMsg.innerHTML = "is currently playing";
			DOM.feedbackBanner.classList.remove('hidden');
			setTimeout(() => {
				DOM.feedbackBanner.classList.add('hidden');
			}, 5000);
		}
		else
			createRoomAndNotify();
	});

	chatSocket.on("join the room", (roomID: string) => {
		joinGame(roomID);
	});

	chatSocket.on("user info update", (updated: sendUserEvent) => {
		const lists = [DOM.chatHistory, DOM.friendsList, DOM.blockedList, DOM.requestsList, DOM.searchList];
		
		console.log("USER INFO UPDATED INITIATED");
		lists.forEach(list => {
			const target = list.querySelector(`li[data-id="${updated.id}"]`) as HTMLLIElement;
			if (target)
			{
				target.dataset.picSrc = getAvatarUrl(updated.avatar!);
				target.dataset.username = updated.nickname!;
				(target.querySelector('.list-profile-name') as HTMLParagraphElement).innerHTML = updated.nickname!;
				(target.querySelector('.list-profile-pic') as HTMLImageElement).src = getAvatarUrl(updated.avatar!);
			}
			if (currentTargetID === updated.id)
				updateHeaderInfo(target);
		})
	});

	chatSocket.on("account deleted", (id: number) => {
		const lists = [DOM.chatHistory, DOM.friendsList, DOM.blockedList, DOM.requestsList, DOM.searchList];
		
		lists.forEach(list => {
			const target = list.querySelector(`li[data-id="${id}"]`) as HTMLLIElement;
			if (target)
				target.remove();
			if (currentTargetID === id)
			{
				closeChat();
				currentOptionsWindow.classList.add('hidden');
				DOM.chatHeader.classList.add('hidden');
				DOM.infoTitle.classList.remove('hidden');
				DOM.gameInviteBanner.classList.add('hidden');
				DOM.feedbackBanner.classList.add('hidden');
			}
		})
	});
}




async function createRoomAndNotify()
{
	const socketManager = SocketManager.getInstance();
	const existingGame = socketManager.getGameInstance();

	if (existingGame && existingGame.gameRunning) {
		console.error('setupLobbyUI called while game is running - this should not happen');
		alert('A game is already running. Please wait for it to finish first.');
		showGamePage();
		return;
	}

	const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
	const game = new PongGame(canvas, socketManager);

	socketManager.setGameInstance(game);
	game.isSinglePlayer = false;
	game.isRemote = true;

	const roomId = await socketManager.createRoom();

	if (roomId)
	{
		// const status = await chatSocket.informOtherPlayer(roomId);
		chatSocket.emit("room id created", roomId, currentTargetID);

		socketManager.onGameStart = () => {
			navigateTo("/game");
			showPage(gamePage);
			startMultiplayerGame(game);
		};
	}
	else
	{
		alert("Something went wrong. Please try again later");
		DOM.gameInviteBanner.classList.add('hidden');
		throw new Error('No room ID received');
	}
}


async function joinGame(roomID: string)
{
	const socketManager = SocketManager.getInstance();
		const existingGame = socketManager.getGameInstance();
		
		if (existingGame && existingGame.gameRunning) {
			// console.error('setupLobbyUI called while game is running - this should not happen');
			// alert('A game is already running. Please wait for it to finish first.');
			// showGamePage();
			return;
		}
		
		const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
		const game = new PongGame(canvas, socketManager);
		
		socketManager.setGameInstance(game);
		game.isSinglePlayer = false;
		game.isRemote = true;

		const success = await socketManager.joinRoom(roomID);
		if (success) {
		socketManager.onGameStart = () => {
			navigateTo("/game");
			showPage(gamePage);
			startMultiplayerGame(game);
		};
		} else {
		throw new Error('Failed to join room');
		}
}

function getAvatarUrl(avatar: string): string
{
    console.log('🔗 getAvatarUrl called with:', avatar);

    let url: string;

    if (!avatar || avatar === 'default' || avatar === 'default1') {
      url = `/imgs/avatars/${avatar || 'default'}.png`;
    } else if (avatar.startsWith('custom_')) {
      const hasExtension = /\.(jpg|png|gif|webp)$/i.test(avatar);
      url = hasExtension ? `/uploads/avatars/${avatar}` : `/uploads/avatars/${avatar}.jpg`;
    } else {
      url = `/imgs/avatars/${avatar}.png`;
    }

    // ✅ Cache busting için timestamp ekle
    const timestamp = new Date().getTime();
    return `${url}?t=${timestamp}`;
  }