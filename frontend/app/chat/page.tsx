"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Pusher from "pusher-js";
import styles from "./chat.module.css";

interface Message {
  id: number;
  room: string;
  username: string;
  color?: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
  isSystem: boolean;
  replyToId?: number | null;
  replyUsername?: string | null;
  replyText?: string | null;
}

interface RoomUser {
  username: string;
  color: string;
  avatarUrl: string;
}

interface Channel {
  id: string;
  name: string;
}

interface ServerData {
  id: string;
  name: string;
  iconUrl?: string;
  abbr: string;
  channels: Channel[];
}

const COLORS = ["#06b6d4", "#8b5cf6", "#f43f5e", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#6366f1"];

// Generate random DiceBear avatar helper
const generateAvatar = (seed: string) => `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${seed}`;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

let pusher: Pusher;

export default function ChatPage() {
  const [joined, setJoined] = useState(false);
  
  // Auth State
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // User Profile State
  const [avatarColor, setAvatarColor] = useState(COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState("");

  // Navigation & View State
  const [activeView, setActiveView] = useState<'servers' | 'home'>('servers');
  const [friends, setFriends] = useState<RoomUser[]>([]);
  const [activeFriend, setActiveFriend] = useState<RoomUser | null>(null);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const [addFriendStatus, setAddFriendStatus] = useState("");

  const [servers, setServers] = useState<ServerData[]>([]);
  const [activeServer, setActiveServer] = useState<ServerData | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  
  // Create Server State
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerAbbr, setNewServerAbbr] = useState("");
  
  // Invite State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  
  // Channel State
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  
  // Chat State
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [serverMembers, setServerMembers] = useState<RoomUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Profile Popup State
  const [profilePopup, setProfilePopup] = useState<{ username: string; color: string; avatarUrl: string; x: number; y: number } | null>(null);
  const profilePopupRef = useRef<HTMLDivElement>(null);
  
  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsColor, setSettingsColor] = useState("");
  const [settingsAvatarUrl, setSettingsAvatarUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverSettingsName, setServerSettingsName] = useState("");
  const [serverSettingsIconUrl, setServerSettingsIconUrl] = useState("");
  const [serverSettingsFile, setServerSettingsFile] = useState<File | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  let currentRoomId = activeServer && activeChannel ? `${activeServer.id}-${activeChannel.id}` : "";
  if (activeView === 'home' && activeFriend) {
    currentRoomId = `dm-${[username, activeFriend.username].sort().join('-')}`;
  }
  const activeMessages = currentRoomId ? (messages[currentRoomId] || []) : [];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [activeMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, scrollToBottom]);

  // Handle messages via stable ref
  const roomRef = useRef(currentRoomId);
  useEffect(() => {
    roomRef.current = currentRoomId;
  }, [currentRoomId]);

  const connectPusher = useCallback(() => {
    if (!pusher) {
      pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: "/api/pusher/auth",
        auth: {
          params: { username }
        }
      });
    }

    // pusher binds here if needed globally
  }, []);

  useEffect(() => {
    if (joined && currentRoomId) {
      connectPusher();
      const channelName = `presence-room-${currentRoomId}`;
      const channel = pusher.subscribe(channelName);

      channel.bind("pusher:subscription_succeeded", () => {
        const members: RoomUser[] = [];
        channel.members.each((member: any) => {
          members.push({ username: member.info.username, color: '#06b6d4', avatarUrl: generateAvatar(member.info.username) });
        });
        setRoomUsers(members);
      });

      channel.bind("pusher:member_added", (member: any) => {
        setRoomUsers(prev => [...prev, { username: member.info.username, color: '#06b6d4', avatarUrl: generateAvatar(member.info.username) }]);
      });

      channel.bind("pusher:member_removed", (member: any) => {
        setRoomUsers(prev => prev.filter(u => u.username !== member.info.username));
      });

      channel.bind("receive_message", (msg: Message) => {
        setMessages((prev) => ({
          ...prev,
          [msg.room]: [...(prev[msg.room] || []), msg],
        }));
      });

      channel.bind("message_deleted", ({ id }: { id: number }) => {
        setMessages((prev) => {
          const updated: Record<string, Message[]> = {};
          for (const room in prev) {
            updated[room] = prev[room].filter((m) => m.id !== id);
          }
          return updated;
        });
      });

      channel.bind("client-typing", ({ username: typingUser, isTyping }: { username: string; isTyping: boolean }) => {
        setTypingUsers((prev) =>
          isTyping ? [...new Set([...prev, typingUser])] : prev.filter((u) => u !== typingUser)
        );
      });

      return () => {
        channel.unbind_all();
        pusher.unsubscribe(channelName);
      };
    }
  }, [joined, currentRoomId, username, connectPusher]);

  // Re-bind core pusher if joined
  useEffect(() => {
    if (joined) {
      connectPusher();
    }
  }, [joined, connectPusher]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!username.trim() || !password.trim()) {
      setAuthError("All fields are required.");
      return;
    }

    const endpoint = isLoginMode ? "/api/login" : "/api/register";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setAuthError(data.error || "Authentication failed.");
        return;
      }

      setAvatarColor(data.color);
      setAvatarUrl(data.avatarUrl);
      
      try {
        const friendRes = await fetch(`${API_URL}/api/friends/${data.username}`);
        if (friendRes.ok) {
          const fData = await friendRes.json();
          setFriends(fData);
        }
      } catch (err) {}
      
      const srvRes = await fetch(`${API_URL}/api/servers?username=${data.username}`);
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        setServers(srvData);
        if (srvData.length > 0) {
          setActiveServer(srvData[0]);
          setActiveChannel(srvData[0].channels[0]);
          
          const initialRoomId = `${srvData[0].id}-${srvData[0].channels[0].id}`;
          
          const memberRes = await fetch(`http://localhost:4000/api/servers/${srvData[0].id}/members`);
          if (memberRes.ok) {
            const members = await memberRes.json();
            setServerMembers(members);
          }
          
          connectSocket();
          socket.emit("join_room", { 
            room: initialRoomId, 
            username: data.username, 
            color: data.color, 
            avatarUrl: data.avatarUrl 
          });
          
          const msgRes = await fetch(`http://localhost:4000/api/messages/${initialRoomId}`);
          if (msgRes.ok) {
            const msgs = await msgRes.json();
            setMessages(prev => ({ ...prev, [initialRoomId]: msgs }));
          }
        } else {
          setActiveView('home');
          connectSocket();
        }
        setJoined(true);
      } else {
        setAuthError("Failed to load servers.");
      }
    } catch (err) {
      setAuthError("Server connection error.");
    }
  };

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    setJoined(false);
    setUsername("");
    setPassword("");
    setAvatarUrl("");
    setServerMembers([]);
    setRoomUsers([]);
    setMessages({});
    setActiveServer(null);
    setActiveChannel(null);
    setShowSettings(false);
  };

  const switchToHome = () => {
    setActiveView('home');
    setActiveServer(null);
    setActiveChannel(null);
    setActiveFriend(null);
  };

  const openDM = async (friend: RoomUser) => {
    setActiveView('home');
    setActiveFriend(friend);
    
    const dmRoomId = `dm-${[username, friend.username].sort().join('-')}`;
    socket.emit("join_room", { room: dmRoomId, username, color: avatarColor, avatarUrl });
    
    if (!messages[dmRoomId]) {
      try {
        const msgRes = await fetch(`${API_URL}/api/messages/${dmRoomId}`);
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          setMessages(prev => ({ ...prev, [dmRoomId]: msgs }));
        }
      } catch (err) {}
    }
    socket.emit("join_room", { room: dmRoomId, username, color: avatarColor, avatarUrl });
    setTypingUsers([]);
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFriendStatus("");
    if (!addFriendUsername.trim()) return;

    try {
      const res = await fetch("http://localhost:4000/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, friendUsername: addFriendUsername.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        if (!friends.find(f => f.username === data.friend.username)) {
          setFriends([...friends, data.friend]);
        }
        setAddFriendStatus(`Successfully added ${data.friend.username}!`);
        setAddFriendUsername("");
      } else {
        setAddFriendStatus(data.error || "Failed to add friend.");
      }
    } catch (err) {
      setAddFriendStatus("Connection error.");
    }
  };

  const switchServer = (srv: ServerData) => {
    setActiveView('servers');
    if (activeServer && srv.id === activeServer.id && activeView === 'servers') return;
    setActiveServer(srv);
    if (srv.channels.length > 0) {
      switchChannel(srv, srv.channels[0]);
    }
  };

  const switchChannel = async (srv: ServerData, ch: Channel) => {
    const newRoomId = `${srv.id}-${ch.id}`;
    if (activeServer && activeChannel) {
        const currentId = `${activeServer.id}-${activeChannel.id}`;
        if (newRoomId === currentId) return;
    }
    
    if (!activeServer || activeServer.id !== srv.id) {
      try {
        const memRes = await fetch(`${API_URL}/api/servers/${srv.id}/members`);
        if (memRes.ok) {
          const members = await memRes.json();
          setServerMembers(members);
        }
      } catch (err) {}
    }
    
    if (!messages[newRoomId]) {
      try {
        const msgRes = await fetch(`${API_URL}/api/messages/${newRoomId}`);
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          setMessages(prev => ({ ...prev, [newRoomId]: msgs }));
        }
      } catch (err) {}
    }

    setActiveServer(srv);
    setActiveChannel(ch);
    socket.emit("join_room", { room: newRoomId, username, color: avatarColor, avatarUrl });
    setTypingUsers([]);
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName.trim() || !newServerAbbr.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newServerName, abbr: newServerAbbr, username })
      });
      if (res.ok) {
        const data = await res.json();
        setServers([...servers, data]);
        setShowAddServer(false);
        setNewServerName("");
        setNewServerAbbr("");
        switchServer(data);
      }
    } catch (err) { console.error(err); }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !activeServer) return;
    setInviteStatus("Inviting...");
    try {
      const res = await fetch(`${API_URL}/api/servers/${activeServer.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: inviteUsername.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setInviteStatus(`Successfully invited ${data.username}!`);
        setInviteUsername("");
        if (!serverMembers.find(m => m.username === data.username)) {
            setServerMembers([...serverMembers, { username: data.username, color: data.color, avatarUrl: data.avatarUrl }]);
        }
      } else {
        setInviteStatus(data.error || "Failed to invite user.");
      }
    } catch (err) {
      setInviteStatus("Connection error.");
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !activeServer) return;
    try {
      const res = await fetch(`${API_URL}/api/servers/${activeServer.id}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName })
      });
      if (res.ok) {
        const newChannel = await res.json();
        const updatedServers = servers.map(srv => {
          if (srv.id === activeServer.id) {
            return { ...srv, channels: [...srv.channels, newChannel] };
          }
          return srv;
        });
        setServers(updatedServers);
        const updatedActive = updatedServers.find(s => s.id === activeServer.id);
        if (updatedActive) setActiveServer(updatedActive);
        
        setShowAddChannel(false);
        setNewChannelName("");
        if (updatedActive) switchChannel(updatedActive, newChannel);
      }
    } catch (err) { console.error(err); }
  };

  const sendMessage = async (e: React.FormEvent, msgTextOverride?: string) => {
    if (e) e.preventDefault();
    const textToSend = msgTextOverride || message;
    if (!textToSend.trim() || !currentRoomId || !joined) return;

    try {
      if (currentRoomId && joined) {
        const channel = pusher.channel(`presence-room-${currentRoomId}`);
        if (channel) channel.trigger("client-typing", { username, isTyping: false });
      }

      await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: currentRoomId,
          message: textToSend,
          username,
          avatarUrl,
          color: avatarColor,
          replyToId: replyingTo?.id || null,
        })
      });
      if (!msgTextOverride) setMessage("");
      setReplyingTo(null);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentRoomId) return;
    e.target.value = ''; // reset so same file can be re-selected
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', username);
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        const msgText = data.isImage
          ? `[img]${data.url}[/img]`
          : `[file]${data.url}|${data.name}[/file]`;
        await sendMessage(null as any, msgText);
      }
    } catch (err) { console.error(err); }
    setIsUploading(false);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    
    if (currentRoomId && joined) {
      const channel = pusher.channel(`presence-room-${currentRoomId}`);
      if (channel) channel.trigger("client-typing", { username, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (currentRoomId && joined) {
        const channel = pusher.channel(`presence-room-${currentRoomId}`);
        if (channel) channel.trigger("client-typing", { username, isTyping: false });
      }
    }, 1500);
  };

  const openSettings = () => {
    setSettingsColor(avatarColor);
    setSettingsAvatarUrl(avatarUrl);
    setSelectedFile(null);
    setShowSettings(true);
  };

  const saveSettings = async () => {
    let finalAvatarUrl = settingsAvatarUrl;
    
    // 1. Handle File Upload if exists
    if (selectedFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("avatar", selectedFile);
      formData.append("username", username);
      
      try {
        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          finalAvatarUrl = data.avatarUrl;
        }
      } catch (err) {
        console.error("Upload failed", err);
      }
      setIsUploading(false);
    }
    
    // 2. Persist Color DB change
    if (settingsColor !== avatarColor) {
      try {
        await fetch(`${API_URL}/api/update-color`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, color: settingsColor })
        });
      } catch (err) { }
    }

    setAvatarColor(settingsColor);
    setAvatarUrl(finalAvatarUrl);
    
    // Broadcast via socket to update immediately for current clients
    socket.emit("update_profile", { username, color: settingsColor, avatarUrl: finalAvatarUrl });
    setShowSettings(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Create local preview
      setSettingsAvatarUrl(URL.createObjectURL(file));
    }
  };

  const rollNewAvatar = () => {
    setSelectedFile(null); // Clear pending file upload if they roll random
    setSettingsAvatarUrl(generateAvatar(username + Math.random().toString(36).substring(7)));
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return isToday ? `Today at ${timeStr}` : `${d.toLocaleDateString()} ${timeStr}`;
  };

  if (!joined) {
    return (
      <div className={styles.landingBg}>
        <div className={styles.landingCard}>
          <h1 className={styles.logoTitle}>Kirkcord</h1>
          <p className={styles.tagline}>The next-gen glassmorphism chat experience.</p>
          
          <div className={styles.authTabs}>
            <button className={`${styles.authTab} ${isLoginMode ? styles.activeTab : ''}`} onClick={() => {setIsLoginMode(true); setAuthError("");}}>Login</button>
            <button className={`${styles.authTab} ${!isLoginMode ? styles.activeTab : ''}`} onClick={() => {setIsLoginMode(false); setAuthError("");}}>Register</button>
          </div>

          <form onSubmit={handleAuth} className={styles.joinForm}>
            {authError && <div className={styles.errorBanner}>{authError}</div>}
            
            <div className={styles.inputGroup}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            
            <div className={styles.inputGroup}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className={styles.joinBtn}>
              {isLoginMode ? "Enter Kirkcord" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatLayout}>
      
      {/* 1. Servers Bar - Floating */}
      <nav className={`${styles.glassPanel} ${styles.serversBar}`}>
        <div 
          className={`${styles.serverIcon} ${activeView === 'home' ? styles.active : ''}`}
          onClick={switchToHome}
          title="Direct Messages"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <div className={styles.serverSeparator} style={{marginTop: '4px', marginBottom: '4px'}} />
        
        {servers.map(srv => (
          <div 
            key={srv.id}
            className={`${styles.serverIcon} ${activeServer?.id === srv.id ? styles.active : ''}`}
            onClick={() => switchServer(srv)}
            title={srv.name}
            style={{ 
              overflow: 'hidden',
              background: srv.iconUrl ? `url("${srv.iconUrl}") center/cover` : (activeServer?.id === srv.id ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.08)')
            }}
          >
            {!srv.iconUrl && srv.abbr}
          </div>
        ))}
        <div className={styles.serverSeparator} />
        <div className={styles.serverIcon} title="Add Server" onClick={() => setShowAddServer(true)}>
          +
        </div>
      </nav>

      {/* 2. Channels/Friends Sidebar */}
      <aside className={`${styles.glassPanel} ${styles.channelsSidebar}`}>
        {activeView === 'servers' && activeServer ? (
          <>
            <header 
              className={styles.sidebarHeader} 
              style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s'}}
              onClick={() => {
                setServerSettingsName(activeServer.name);
                setServerSettingsIconUrl(activeServer.iconUrl || "");
                setServerSettingsFile(null);
                setShowServerSettings(true);
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)'}
            >
              <span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{activeServer.name}</span>
              <button 
                onClick={(e) => {e.stopPropagation(); setInviteStatus(""); setInviteUsername(""); setShowInviteModal(true);}}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', marginLeft: '8px' }}
                title="Invite User"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </button>
            </header>
            <div className={styles.channelsList}>
              <div className={styles.channelCategory} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Text Channels
                </div>
                <button 
                  onClick={() => setShowAddChannel(true)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                  title="Create Channel"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
              </div>
              {activeServer.channels.map(ch => (
                <div 
                  key={ch.id} 
                  className={`${styles.channelItem} ${activeChannel?.id === ch.id ? styles.active : ''}`}
                  onClick={() => switchChannel(activeServer, ch)}
                >
                  <div className={styles.channelIconWrap}>#</div>
                  <span>{ch.name}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <header className={styles.sidebarHeader} style={{ fontSize: '1.05rem' }}>
              Direct Messages
            </header>
            <div className={styles.channelsList}>
              <div 
                className={`${styles.channelItem} ${!activeFriend ? styles.active : ''}`}
                onClick={switchToHome}
              >
                <div className={styles.channelIconWrap} style={{ background: 'transparent' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                </div>
                <span>Add Friend</span>
              </div>
              
              <div className={styles.channelCategory} style={{ marginTop: '16px' }}>Friends</div>
              {friends.map(friend => (
                <div 
                  key={friend.username} 
                  className={`${styles.channelItem} ${activeFriend?.username === friend.username ? styles.active : ''}`}
                  onClick={() => openDM(friend)}
                  style={{ gap: '12px', padding: '8px 12px' }}
                >
                  <div className={styles.memberAvatar} style={{ width: '28px', height: '28px', background: friend.avatarUrl ? `url("${friend.avatarUrl}") center/cover, ${friend.color || '#06b6d4'}` : (friend.color || '#06b6d4'), borderColor: friend.color, fontSize: '0.8rem' }}>
                    {!friend.avatarUrl && friend.username.charAt(0).toUpperCase()}
                  </div>
                  <span>{friend.username}</span>
                </div>
              ))}
            </div>
          </>
        )}
        
        {/* User Panel */}
        <div className={styles.userPanel}>
          <div 
            className={styles.userPanelAvatar} 
            style={{ 
              background: avatarUrl ? `url("${avatarUrl}") center/cover, ${avatarColor}` : avatarColor,
              borderColor: avatarColor
            }}
          >
            {!avatarUrl && username.charAt(0).toUpperCase()}
          </div>
          <div className={styles.userPanelMeta}>
            <div className={styles.userPanelName}>{username}</div>
            <div className={styles.userPanelStatus}>Online</div>
          </div>
          <button className={styles.settingsBtn} onClick={openSettings} title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
        </div>
      </aside>

      {/* 3. Main Chat Area */}
      {activeView === 'home' && !activeFriend ? (
        <main className={`${styles.glassPanel} ${styles.chatMain}`} style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: '440px', width: '100%', padding: '40px', background: 'rgba(0,0,0,0.2)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '8px', color: '#fff' }}>Add a Friend</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>You can connect natively across the Nexus by entering an exact username.</p>
            <form onSubmit={handleAddFriend} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className={styles.inputWrapper} style={{ padding: '0 16px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px' }}>
                <input 
                  type="text" 
                  value={addFriendUsername} 
                  onChange={e => setAddFriendUsername(e.target.value)} 
                  placeholder="Enter a username... e.g. wumpus" 
                  required 
                />
              </div>
              <button type="submit" className={styles.joinBtn} style={{ padding: '14px', borderRadius: '12px' }}>Send Friend Request</button>
            </form>
            {addFriendStatus && (
              <div style={{ marginTop: '24px', color: addFriendStatus.includes("Failed") || addFriendStatus.includes("Cannot") || addFriendStatus.includes("error") ? '#fca5a5' : '#10b981', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600 }}>
                {addFriendStatus}
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className={`${styles.glassPanel} ${styles.chatMain}`}>
        <header className={styles.chatHeader}>
          {activeView === 'servers' && activeChannel ? (
            <>
              <div className={styles.chatHeaderIcon}>#</div>
              <h2 className={styles.chatHeaderTitle}>{activeChannel.name}</h2>
              <span className={styles.chatHeaderSubtitle}>Welcome to {activeServer?.name}</span>
            </>
          ) : activeFriend ? (
            <>
              <div className={styles.chatHeaderIcon} style={{ borderRadius: '50%' }}>@</div>
              <h2 className={styles.chatHeaderTitle}>{activeFriend.username}</h2>
              <span className={styles.chatHeaderSubtitle}>Direct Message</span>
            </>
          ) : null}
        </header>

        <div className={styles.chatAreaWrapper}>
          <section className={styles.messagesWrapper}>
            <div className={styles.messagesList}>
              {activeMessages.length === 0 && (
                <div style={{ margin: 'auto', textAlign: 'center', padding: '40px' }}>
                  <h1 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>{activeView === 'servers' ? `#${activeChannel?.name}` : `@${activeFriend?.username}`}</h1>
                  <p style={{ color: 'var(--text-secondary)' }}>You found a quiet corner. Be the first to say hello!</p>
                </div>
              )}
              {activeMessages.map((msg, i) => {
                const prevMsg = activeMessages[i - 1];
                // Always show header if there's a reply, to avoid visual confusion
                const showHeader = !prevMsg || prevMsg.username !== msg.username || prevMsg.isSystem !== msg.isSystem || (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() > 300000) || !!msg.replyToId;

                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className={styles.systemMsgDivider}>
                      <span>{msg.text}</span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={styles.messageItem} style={{ marginTop: showHeader ? '16px' : '0', position: 'relative' }}
                    onMouseEnter={e => { const el = e.currentTarget.querySelector('.msgActions') as HTMLElement; if(el) el.style.opacity='1'; }}
                    onMouseLeave={e => { const el = e.currentTarget.querySelector('.msgActions') as HTMLElement; if(el) el.style.opacity='0'; }}
                  >
                    {/* Action buttons on hover */}
                    <div className="msgActions" style={{ position: 'absolute', top: '-14px', right: '12px', display: 'flex', gap: '2px', opacity: 0, transition: 'opacity 0.15s', background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '4px 6px', zIndex: 10 }}>
                      <button
                        onClick={() => setReplyingTo(msg)}
                        title="Reply"
                        style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#06b6d4')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      </button>
                      {msg.username === username && (
                        <button
                          onClick={() => socket.emit('delete_message', { messageId: msg.id, room: currentRoomId })}
                          title="Delete"
                          style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#f43f5e')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      )}
                    </div>

                    {showHeader ? (
                      <div 
                        className={styles.messageAvatar} 
                        style={{ 
                          background: msg.avatarUrl ? `url("${msg.avatarUrl}") center/cover, ${msg.color || '#06b6d4'}` : (msg.color || '#06b6d4'),
                          borderColor: msg.color,
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setProfilePopup({ username: msg.username, color: msg.color || '#06b6d4', avatarUrl: msg.avatarUrl || '', x: rect.right + 8, y: rect.top });
                        }}
                      >
                        {!msg.avatarUrl && msg.username.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <div style={{ width: '60px', flexShrink: 0 }} />
                    )}
                    <div className={styles.messageContent}>
                      {/* Reply preview */}
                      {msg.replyToId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', paddingLeft: '2px' }}>
                          <div style={{ width: '2px', height: '100%', minHeight: '28px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', flexShrink: 0 }} />
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{flexShrink:0}}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                          <span style={{ color: '#9ca3af', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
                            <strong style={{ color: '#cbd5e1' }}>{msg.replyUsername}</strong>{' '}
                            {msg.replyText}
                          </span>
                        </div>
                      )}
                      {showHeader && (
                        <div className={styles.messageHeader}>
                          <span 
                            className={styles.messageSender} 
                            style={{ textShadow: `0 0 10px ${msg.color}`, cursor: 'pointer' }}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setProfilePopup({ username: msg.username, color: msg.color || '#06b6d4', avatarUrl: msg.avatarUrl || '', x: rect.left, y: rect.bottom + 6 });
                            }}
                          >{msg.username}</span>
                          <span className={styles.messageTime}>{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={styles.messageText}>
                        {msg.text.startsWith('[img]') && msg.text.endsWith('[/img]') ? (
                          <img
                            src={msg.text.slice(5, -6)}
                            alt="attachment"
                            style={{ maxWidth: '320px', maxHeight: '240px', borderRadius: '10px', marginTop: '4px', display: 'block', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                            onClick={() => window.open(msg.text.slice(5, -6), '_blank')}
                          />
                        ) : msg.text.startsWith('[file]') && msg.text.endsWith('[/file]') ? (() => {
                          const parts = msg.text.slice(6, -7).split('|');
                          const url = parts[0]; const name = parts[1] || 'File';
                          return (
                            <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '8px 14px', color: '#06b6d4', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500, marginTop: '4px' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              {name}
                            </a>
                          );
                        })() : msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {typingUsers.length > 0 && (
              <div className={styles.typingIndicator}>
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            )}

            <form onSubmit={sendMessage} className={styles.inputArea}>
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px 8px 0 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.82rem', color: '#9ca3af' }}>
                  <span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{marginRight:'5px',verticalAlign:'middle'}}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    Replying to <strong style={{ color: '#e2e8f0' }}>{replyingTo.username}</strong>
                  </span>
                  <button type="button" onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                </div>
              )}
              <div className={styles.inputWrapper}>
                {/* Attachment button — styled like settingsBtn */}
                <label
                  title={isUploading ? 'Uploading...' : 'Attach a file'}
                  className={styles.settingsBtn}
                  style={{
                    flexShrink: 0,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    opacity: isUploading ? 0.5 : 1,
                    marginLeft: '2px',
                    transform: 'none',
                  }}
                >
                  {isUploading
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" style={{animation:'spin 1s linear infinite'}} /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  }
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                    style={{ display: 'none' }}
                    onChange={handleAttachment}
                    disabled={isUploading}
                  />
                </label>
                <input
                  type="text"
                  placeholder={`Message ${activeView === 'servers' ? `#${activeChannel?.name}` : `@${activeFriend?.username}`}`}
                  value={message}
                  onChange={handleTyping}
                  autoFocus
                  style={{ paddingRight: '12px', paddingLeft: '10px' }}
                />
              </div>
            </form>
          </section>

          {/* 4. Members Sidebar (Inside main block) */}
          <aside className={styles.membersSidebar}>
            <div className={styles.membersGroup}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              Online—{roomUsers.length}
            </div>
            <div className={styles.membersList}>
              {roomUsers.map((user) => (
                <div
                  key={user.username}
                  className={styles.memberItem}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setProfilePopup({ username: user.username, color: user.color || '#06b6d4', avatarUrl: user.avatarUrl || '', x: rect.left - 272, y: rect.top });
                  }}
                >
                  <div 
                    className={styles.memberAvatar} 
                    style={{ 
                      background: user.avatarUrl ? `url("${user.avatarUrl}") center/cover, ${user.color || '#06b6d4'}` : (user.color || '#06b6d4'),
                      borderColor: user.color
                    }}
                  >
                    {!user.avatarUrl && user.username.charAt(0).toUpperCase()}
                    <div className={styles.memberStatus} />
                  </div>
                  <div className={styles.memberName}>
                    {user.username}
                  </div>
                </div>
              ))}
              
              {(() => {
                const offlineUsers = serverMembers.filter(m => !roomUsers.find(u => u.username === m.username));
                if (offlineUsers.length === 0) return null;
                return (
                  <>
                    <div className={styles.membersGroup} style={{ marginTop: '24px', paddingLeft: 0 }}>
                      Offline—{offlineUsers.length}
                    </div>
                    {offlineUsers.map((user) => (
                      <div
                        key={user.username}
                        className={styles.memberItem}
                        style={{ opacity: 0.5 }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setProfilePopup({ username: user.username, color: user.color || '#06b6d4', avatarUrl: user.avatarUrl || '', x: rect.left - 272, y: rect.top });
                        }}
                      >
                        <div 
                          className={styles.memberAvatar} 
                          style={{ 
                            background: user.avatarUrl ? `url("${user.avatarUrl}") center/cover, ${user.color || '#06b6d4'}` : (user.color || '#06b6d4'),
                            borderColor: 'transparent',
                            filter: 'grayscale(100%)'
                          }}
                        >
                          {!user.avatarUrl && user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.memberName} style={{ color: 'var(--text-secondary)' }}>
                          {user.username}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </aside>
        </div>
      </main>
      )}

      {/* Server Settings Modal Overlay */}
      {showServerSettings && activeServer && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:'8px', verticalAlign:'middle'}}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Server Settings
            </h2>
            
            <div className={styles.avatarPreviewRow}>
              <div 
                className={styles.avatarPreview} 
                style={{ 
                  background: serverSettingsIconUrl ? `url("${serverSettingsIconUrl}") center/cover` : 'rgba(255,255,255,0.1)',
                  borderRadius: '20px'
                }}
              >
                {!serverSettingsIconUrl && activeServer.abbr}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  A custom icon helps your server stand out in the sidebar.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <label className={styles.uploadBtnLabel}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload Icon
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setServerSettingsFile(file);
                          setServerSettingsIconUrl(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.inputGroup} style={{ marginBottom: "24px" }}>
              <label>Server Name</label>
              <input 
                type="text" 
                value={serverSettingsName} 
                onChange={e => setServerSettingsName(e.target.value)} 
                required 
              />
            </div>

            <div className={styles.modalActions}>
              <button 
                className={styles.logoutBtn} 
                onClick={() => setShowLeaveConfirm(true)}
                style={{ marginRight: 'auto' }}
              >
                Leave Server
              </button>
              <button className={styles.cancelBtn} onClick={() => setShowServerSettings(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={async () => {
                if (!activeServer) return;
                setIsUploading(true);
                try {
                  const formData = new FormData();
                  formData.append('name', serverSettingsName);
                  if (serverSettingsFile) {
                    formData.append('icon', serverSettingsFile);
                  }
                  const res = await fetch(`${API_URL}/api/servers/${activeServer.id}`, {
                    method: 'POST',
                    body: formData
                  });
                  if (res.ok) {
                    const data = await res.json();
                    const updatedServer = { ...activeServer, name: data.name, iconUrl: data.iconUrl || activeServer.iconUrl };
                    setServers(prev => prev.map(s => s.id === activeServer.id ? updatedServer : s));
                    setActiveServer(updatedServer);
                    setShowServerSettings(false);
                  } else {
                    const errData = await res.json();
                    alert(errData.error || "Failed to update server.");
                  }
                } catch (err) { 
                  console.error(err); 
                  alert("An unexpected error occurred.");
                }
                setIsUploading(false);
              }}>
                {isUploading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Profile Customization
            </h2>
            
            <div className={styles.avatarPreviewRow}>
              <div 
                className={styles.avatarPreview} 
                style={{ 
                  background: settingsAvatarUrl ? `url("${settingsAvatarUrl}") center/cover, ${settingsColor}` : settingsColor,
                  border: `3px solid ${settingsColor}`
                }}
              >
                {!settingsAvatarUrl && username.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Avatar Art</div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* File Upload Button wrapper */}
                  <label className={styles.uploadBtnLabel} title="Upload an image from your device">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Upload Image
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={handleFileChange}
                    />
                  </label>
                  <button className={styles.randomizeBtn} onClick={rollNewAvatar} title="Generate a random fun emoji">
                    🎲 Random
                  </button>
                </div>
                {selectedFile && <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>{selectedFile.name} ready to upload</div>}
              </div>
            </div>

            <div className={styles.inputGroup} style={{ marginBottom: '24px' }}>
              <label>Account Theme Color</label>
              <div className={styles.colorPicker}>
                {COLORS.map(c => (
                  <div 
                    key={c}
                    className={`${styles.colorOption} ${settingsColor === c ? styles.selected : ''}`}
                    style={{ background: c }}
                    onClick={() => setSettingsColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.logoutBtn} onClick={handleLogout} disabled={isUploading}>Log Out</button>
              <button className={styles.cancelBtn} onClick={() => setShowSettings(false)} disabled={isUploading}>Cancel</button>
              <button className={styles.saveBtn} onClick={saveSettings} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal Overlay */}
      {showAddServer && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:'8px', verticalAlign:'middle'}}><path d="M12 5v14M5 12h14"/></svg>
              Create a Server
            </h2>
            <form onSubmit={handleCreateServer}>
              <div className={styles.inputGroup} style={{ marginBottom: "16px" }}>
                <label>Server Name</label>
                <input 
                  type="text" 
                  value={newServerName} 
                  onChange={e => setNewServerName(e.target.value)} 
                  placeholder="e.g. My Awesome Club" 
                  required 
                />
              </div>
              <div className={styles.inputGroup} style={{ marginBottom: "24px" }}>
                <label>Abbreviation (1-3 chars)</label>
                <input 
                  type="text" 
                  value={newServerAbbr} 
                  onChange={e => setNewServerAbbr(e.target.value.substring(0,3))} 
                  placeholder="e.g. MAC" 
                  required 
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowAddServer(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal Overlay */}
      {showInviteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:'8px', verticalAlign:'middle'}}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Invite to {activeServer?.name}
            </h2>
            <form onSubmit={handleInviteUser}>
              <div className={styles.inputGroup} style={{ marginBottom: "16px" }}>
                <label>Username</label>
                <input 
                  type="text" 
                  value={inviteUsername} 
                  onChange={e => setInviteUsername(e.target.value)} 
                  placeholder="e.g. wumpus" 
                  required 
                />
              </div>
              {inviteStatus && (
                <div style={{ marginBottom: '16px', color: inviteStatus.includes("Failed") || inviteStatus.includes("error") || inviteStatus.includes("found") ? '#fca5a5' : '#10b981', fontSize: '0.9rem', fontWeight: 600 }}>
                  {inviteStatus}
                </div>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => {setShowInviteModal(false); setInviteStatus("");}}>Done</button>
                <button type="submit" className={styles.saveBtn}>Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Channel Modal Override */}
      {showAddChannel && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:'8px', verticalAlign:'middle'}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Create Text Channel
            </h2>
            <form onSubmit={handleCreateChannel}>
              <div className={styles.inputGroup} style={{ marginBottom: "24px" }}>
                <label>Channel Name</label>
                <input 
                  type="text" 
                  value={newChannelName} 
                  onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} 
                  placeholder="e.g. general-chat" 
                  required 
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowAddChannel(false)}>Cancel</button>
                <button type="submit" className={styles.saveBtn}>Create Channel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Popup */}
      {profilePopup && (
        <div
          ref={profilePopupRef}
          onClick={() => setProfilePopup(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: `${Math.min(profilePopup.x, window.innerWidth - 340)}px`,
              top: `${Math.min(profilePopup.y, window.innerHeight - 300)}px`,
              width: '300px',
              background: 'rgba(20, 20, 30, 0.6)',
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Minimal Content Section */}
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
                {/* Large squared avatar matching site aesthetic */}
                <div style={{
                  width: '100px', height: '100px', borderRadius: '24px',
                  background: profilePopup.avatarUrl
                    ? `url("${profilePopup.avatarUrl}") center/cover, ${profilePopup.color}`
                    : profilePopup.color,
                  border: `2px solid rgba(255, 255, 255, 0.1)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.5rem', fontWeight: 800, color: '#fff',
                  boxShadow: `0 8px 24px rgba(0,0,0,0.4)`
                }}>
                  {!profilePopup.avatarUrl && profilePopup.username.charAt(0).toUpperCase()}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1.6rem', color: '#fff', margin: 0 }}>
                    {profilePopup.username}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
                    <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>Active Now</span>
                  </div>
                </div>
              </div>

              {/* Native-style action button */}
              <button
                style={{
                  width: '100%', height: '48px', borderRadius: '14px',
                  background: 'var(--accent-gradient)', border: 'none',
                  color: '#fff', fontWeight: 700, cursor: 'pointer',
                  marginTop: '24px', fontSize: '1rem',
                  boxShadow: '0 8px 20px rgba(6, 182, 212, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => { (e.currentTarget as any).style.transform = 'translateY(-2px)'; (e.currentTarget as any).style.boxShadow = '0 12px 28px rgba(6, 182, 212, 0.5)'; }}
                onMouseLeave={e => { (e.currentTarget as any).style.transform = 'none'; (e.currentTarget as any).style.boxShadow = '0 8px 20px rgba(6, 182, 212, 0.3)'; }}
              >
                Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Server Confirmation Modal */}
      {showLeaveConfirm && activeServer && (
        <div className={styles.modalOverlay} style={{ zIndex: 10001 }}>
          <div className={`${styles.modalContent} ${styles.dangerModal}`} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '20px', 
              background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h2 className={styles.modalTitle} style={{ marginBottom: '12px' }}>Leave Server?</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.5' }}>
              Are you sure you want to leave <strong>{activeServer.name}</strong>? 
              You'll lose access to all channels and messages.
            </p>
            <div className={styles.modalActions} style={{ justifyContent: 'stretch', gap: '12px' }}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowLeaveConfirm(false)}
                style={{ flex: 1 }}
              >
                Go Back
              </button>
              <button 
                className={styles.logoutBtn} 
                style={{ flex: 1, margin: 0 }}
                onClick={async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/servers/${activeServer.id}/leave`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ username })
                    });
                    if (res.ok) {
                      setServers(prev => prev.filter(s => s.id !== activeServer.id));
                      setShowLeaveConfirm(false);
                      setShowServerSettings(false);
                      switchToHome();
                    }
                  } catch (err) { console.error(err); }
                }}
              >
                Yes, Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
