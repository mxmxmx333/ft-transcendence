import { info } from "console";

const searchBar = document.getElementById('search-bar') as HTMLInputElement;
const noResults = document.getElementById('no-results') as HTMLParagraphElement;
const noFriends = document.getElementById('no-friends') as HTMLParagraphElement;
const noBlocked = document.getElementById('no-blocked') as HTMLParagraphElement;
const noRequests = document.getElementById('no-requests') as HTMLParagraphElement;
const findUser = document.getElementById('find-user') as HTMLParagraphElement;
const searchResults = document.getElementById('search-results') as HTMLDivElement;
const searchList = document.getElementById('search-list') as HTMLUListElement;
const chatHistory = document.getElementById('chat-history') as HTMLUListElement;
const friendsList = document.getElementById('friends-list') as HTMLUListElement;
const headerName = document.getElementById('header-user-name') as HTMLParagraphElement;
const headerPic = document.getElementById('header-profile-pic') as HTMLImageElement;
const headerPicArea = document.getElementById('header-pic') as HTMLDivElement;
const profileView = document.getElementById('profile-pop-up') as HTMLElement; //Section element
const closeProfileViewBtn = document.getElementById('close-profile-view-btn') as HTMLButtonElement;
const profileViewPic = document.getElementById('profile-view-pic') as HTMLImageElement;
const profileViewName = document.getElementById('profile-view-name') as HTMLHeadingElement;
const sideBarMenu = document.getElementById('side-bar-menu') as HTMLDivElement;
const searchInfo = document.getElementById('search-list-info') as HTMLParagraphElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const chatMsgArea = document.getElementById('chat-messages-area') as HTMLElement; // Section element
const chatFooter = document.getElementById('chat-footer') as HTMLDivElement;
const chatsMenuOptions = document.getElementById('chat-friend-options') as HTMLElement; // Section element
const friendsMenuOptions = document.getElementById('friends-nav-options') as HTMLElement; // Section element
const friendsMenuExBlockedOptions = document.getElementById('friends-blocked-nav-options') as HTMLElement;
const friendsMenuExRequestsOptions = document.getElementById('friends-requests-nav-options') as HTMLElement;
const usersMenuOptions = document.getElementById('users-nav-options') as HTMLElement; // Section element
const chatOptionsBtn = document.getElementById('chat-friend-options-btn') as HTMLButtonElement;
// const tournamentChat = document.getElementById('tournament-chat') as HTMLLIElement;
// const tournamentMainChatArea = document.getElementById('tournament-chat-main') as HTMLElement;
const chatMainArea = document.getElementById('chat-main') as HTMLElement;
const friendsMenuExtension = document.getElementById('friends-menu-extension') as HTMLDivElement;
const blockedList = document.getElementById('blocked-list') as HTMLUListElement;
const requestsList = document.getElementById('requests-list') as HTMLUListElement;
const requesterID = document.getElementById('request-from') as HTMLSpanElement;
const chatsNotification = document.getElementById('notification-dot-chats') as HTMLDivElement;
const friendsNotification = document.getElementById('notification-dot-friends') as HTMLDivElement;
const requestsNotification = document.getElementById('notification-dot-requests') as HTMLDivElement;
const liveChatLink = document.getElementById('live-chat-link') as HTMLLIElement;
const liveChatNotification = document.getElementById('live-chat-notification') as HTMLElement;
const addFriendBtn = document.getElementById('add-friend-btn') as HTMLButtonElement;
const requestSentInfo = document.getElementById('request-sent-info') as HTMLParagraphElement;
const blockedByUserOptions = document.getElementById('blocked-by-user-options') as HTMLElement;
const viewProfileBtn = document.getElementById('view-profile-btn') as HTMLButtonElement;
const mainHeaderMenu = document.querySelector('.main-nav') as HTMLUListElement;
const acceptRequestBtn = document.getElementById('accept-request-btn') as HTMLButtonElement;
const declineRequestBtn = document.getElementById('decline-request-btn') as HTMLButtonElement;
const confirmRemoveFriend = document.getElementById('confirm-remove-friend') as HTMLElement;
const removeFriendNick = document.getElementById('remove-friend-nickname') as HTMLSpanElement;
const removeFriendYesBtn = document.getElementById('remove-friend-yes-btn') as HTMLButtonElement;
const removeFriendNoBtn = document.getElementById('remove-friend-no-btn') as HTMLButtonElement;
const chatsMenuBlockedOptions = document.getElementById('chat-blocked-friend-options') as HTMLElement;
const chatsMenuBlockedByOptions = document.getElementById('chat-blocked-by-friend-options') as HTMLElement;
const chatFooterBlocked = document.getElementById('chat-footer-blocked') as HTMLDivElement;
const sendMsgBtn = document.getElementById('send-msg-btn') as HTMLButtonElement;
const noChats = document.getElementById('no-chats') as HTMLParagraphElement;
const goToBottomIcon = document.getElementById('go-to-bottom-icon') as HTMLDivElement;
const newMsgsCount = document.getElementById('new-msgs-count') as HTMLDivElement;
const goToBottomBtn = document.getElementById('go-to-bottom-btn') as HTMLButtonElement;
const chatContainer = document.querySelector('.chat-container') as HTMLDivElement;
const reconnectInfo = document.querySelector('.reconnect-info') as HTMLDivElement;
const statusDot = document.getElementById('status-dot') as HTMLDivElement;
const onlineStatus = document.getElementById('online-status') as HTMLParagraphElement;
const chatHeader = document.getElementById('chat-header') as HTMLElement;
const tournamentHeader = document.getElementById('tournament-header') as HTMLElement;
const gameInviteBanner = document.getElementById('game-invitation-banner') as HTMLElement;
const gameInviteFrom = document.getElementById('game-invite-from') as HTMLElement;
const acceptGameInviteBtn = document.getElementById('accept-game-invite-btn') as HTMLElement;
const declineGameInviteBtn = document.getElementById('decline-game-invite-btn') as HTMLElement;
const feedbackBanner = document.getElementById('invite-feedback') as HTMLElement;
const feedbackFrom = document.getElementById('feedback-from-player') as HTMLElement;
const feedbackMsg = document.getElementById('feedback-msg') as HTMLElement;
const infoTitle = document.getElementById('info-title') as HTMLDivElement;

export const DOM = {
	searchBar,
	noResults,
	noFriends,
	noBlocked,
	noRequests,
	findUser,
	searchResults,
	searchList,
	chatHistory,
	friendsList,
	headerName,
	headerPic,
	headerPicArea,
	profileView,
	closeProfileViewBtn,
	profileViewPic,
	profileViewName,
	sideBarMenu,
	searchInfo,
	chatInput,
	chatMsgArea,
	chatFooter,
	chatsMenuOptions,
	friendsMenuOptions,
	friendsMenuExBlockedOptions,
	friendsMenuExRequestsOptions,
	usersMenuOptions,
	chatOptionsBtn,
	// tournamentChat,
	// tournamentMainChatArea,
	chatMainArea,
	friendsMenuExtension,
	blockedList,
	requestsList,
	requesterID,
	chatsNotification,
	friendsNotification,
	requestsNotification,
	liveChatLink,
	liveChatNotification,
	addFriendBtn,
	requestSentInfo,
	blockedByUserOptions,
	viewProfileBtn,
	mainHeaderMenu,
	acceptRequestBtn,
	declineRequestBtn,
	confirmRemoveFriend,
	removeFriendNick,
	removeFriendYesBtn,
	removeFriendNoBtn,
	chatsMenuBlockedOptions,
	chatsMenuBlockedByOptions,
	chatFooterBlocked,
	sendMsgBtn,
	noChats,
	goToBottomIcon,
	newMsgsCount,
	goToBottomBtn,
	chatContainer,
	reconnectInfo,
	statusDot,
	onlineStatus,
	chatHeader,
	tournamentHeader,
	gameInviteBanner,
	gameInviteFrom,
	acceptGameInviteBtn,
	declineGameInviteBtn,
	feedbackBanner,
	feedbackFrom,
	feedbackMsg,
	infoTitle
};


export interface sendUserEvent {
  id: number;
  nickname: string | null;
  avatar: string | null;
}