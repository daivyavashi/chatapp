require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json()); // To parse JSON request bodies
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded avatars

const PORT = process.env.PORT || 4000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── Database Setup ───────────────────────────────────────────
const dbFile = path.join(__dirname, 'kirkcord.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("Database opening error:", err);
  else {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          color TEXT DEFAULT '#06b6d4',
          avatarUrl TEXT DEFAULT ''
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          abbr TEXT NOT NULL,
          icon_url TEXT
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          server_id TEXT,
          name TEXT NOT NULL,
          FOREIGN KEY (server_id) REFERENCES servers(id)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS server_members (
          server_id TEXT,
          username TEXT,
          PRIMARY KEY (server_id, username),
          FOREIGN KEY (server_id) REFERENCES servers(id)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS friends (
          user1 TEXT,
          user2 TEXT,
          PRIMARY KEY (user1, user2)
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room TEXT NOT NULL,
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          isSystem INTEGER DEFAULT 0,
          reply_to_id INTEGER DEFAULT NULL
        )
      `, (err) => {
        if (err) console.error("Table creation error:", err);
        else {
          // Migrate: add reply_to_id column if it doesn't exist
          db.run("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER DEFAULT NULL", (e) => {
            // Ignore error - it just means the column already exists
          });
          console.log("Database tables ready.");
        }
      });
    });
  }
});

// ── File Uploads Setup (Multer) ──────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const attachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'attach-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadAttachment = multer({ storage: attachmentStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// ── REST API ─────────────────────────────────────────────────

// Register
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // Random initial DiceBear avatar just in case
    const defaultAvatar = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${username + Date.now()}`;
    
    db.run(
      "INSERT INTO users (username, password, avatarUrl) VALUES (?, ?, ?)",
      [username, hashedPassword, defaultAvatar],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(409).json({ error: "Username already exists." });
          }
          return res.status(500).json({ error: "Database error." });
        }
        res.status(201).json({ 
          id: this.lastID, 
          username, 
          color: '#06b6d4', 
          avatarUrl: defaultAvatar 
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: "Server error during registration." });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!user) return res.status(404).json({ error: "User not found." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials." });

    res.json({
      id: user.id,
      username: user.username,
      color: user.color,
      avatarUrl: user.avatarUrl
    });
  });
});

// Upload Avatar
app.post("/api/upload-avatar", upload.single('avatar'), (req, res) => {
  const { username } = req.body;
  if (!req.file || !username) {
    return res.status(400).json({ error: "No file or username provided." });
  }

  const avatarUrl = `http://localhost:4000/uploads/${req.file.filename}`;
  
  db.run("UPDATE users SET avatarUrl = ? WHERE username = ?", [avatarUrl, username], (err) => {
    if (err) return res.status(500).json({ error: "Failed to update db." });
    res.json({ avatarUrl });
  });
});

// Update Theme Color
app.post("/api/update-color", (req, res) => {
  const { username, color } = req.body;
  db.run("UPDATE users SET color = ? WHERE username = ?", [color, username], (err) => {
    if (err) return res.status(500).json({ error: "Failed to update color." });
    res.json({ success: true, color });
  });
});

// Upload Attachment
app.post("/api/upload-attachment", uploadAttachment.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided." });
  const fileUrl = `http://localhost:4000/uploads/${req.file.filename}`;
  const isImage = req.file.mimetype.startsWith('image/');
  res.json({ url: fileUrl, name: req.file.originalname, isImage });
});

// Get Servers and Channels
app.get("/api/servers", (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username required." });

  db.all(`
    SELECT s.* FROM servers s
    JOIN server_members sm ON s.id = sm.server_id
    WHERE sm.username = ?
  `, [username], (err, servers) => {
    if (err) return res.status(500).json({ error: "Failed to fetch servers." });
    
    if (servers.length === 0) {
      return res.json([]);
    }

    const serverIds = servers.map(s => s.id);
    const placeholders = serverIds.map(() => '?').join(',');

    db.all(`SELECT * FROM channels WHERE server_id IN (${placeholders})`, serverIds, (err, channels) => {
      if (err) return res.status(500).json({ error: "Failed to fetch channels." });
      
      const formattedServers = servers.map(srv => {
        return {
          id: srv.id,
          name: srv.name,
          abbr: srv.abbr,
          iconUrl: srv.icon_url,
          channels: channels.filter(ch => ch.server_id === srv.id).map(ch => ({ id: ch.id, name: ch.name }))
        };
      });
      res.json(formattedServers);
    });
  });
});

// Update Server Settings
app.post("/api/servers/:serverId", uploadAttachment.single('icon'), (req, res) => {
  const { serverId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Server name required." });

  const iconUrl = req.file ? `http://localhost:4000/uploads/${req.file.filename}` : null;

  if (iconUrl) {
    db.run("UPDATE servers SET name = ?, icon_url = ? WHERE id = ?", [name, iconUrl, serverId], (err) => {
      if (err) return res.status(500).json({ error: "Failed to update server." });
      res.json({ success: true, name, iconUrl });
    });
  } else {
    db.run("UPDATE servers SET name = ? WHERE id = ?", [name, serverId], (err) => {
      if (err) return res.status(500).json({ error: "Failed to update server." });
      res.json({ success: true, name });
    });
  }
});

// Leave Server
app.post("/api/servers/:serverId/leave", (req, res) => {
  const { serverId } = req.params;
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required." });

  db.run("DELETE FROM server_members WHERE server_id = ? AND username = ?", [serverId, username], (err) => {
    if (err) return res.status(500).json({ error: "Failed to leave server." });
    res.json({ success: true });
  });
});

// Create a new Server
app.post("/api/servers", (req, res) => {
  const { name, abbr, username } = req.body;
  if (!name || !abbr || !username) return res.status(400).json({ error: "Name, abbreviation, and username required." });
  
  const srvId = "s-" + Date.now();
  const chId = "c-" + Date.now();
  
  db.run("INSERT INTO servers (id, name, abbr) VALUES (?, ?, ?)", [srvId, name, abbr], (err) => {
    if (err) return res.status(500).json({ error: "Failed to create server." });
    db.run("INSERT INTO channels (id, server_id, name) VALUES (?, ?, ?)", [chId, srvId, 'general'], (err) => {
      if (err) return res.status(500).json({ error: "Failed to create default channel." });
      db.run("INSERT INTO server_members (server_id, username) VALUES (?, ?)", [srvId, username], (err) => {
        if (err) return res.status(500).json({ error: "Failed to add member to server." });
        res.status(201).json({
          id: srvId,
          name,
          abbr,
          channels: [{ id: chId, name: 'general' }]
        });
      });
    });
  });
});

// Create a new Channel
app.post("/api/servers/:serverId/channels", (req, res) => {
  const { name } = req.body;
  const serverId = req.params.serverId;
  if (!name) return res.status(400).json({ error: "Name required." });
  
  // Format name (lowercase and dashes)
  const formattedName = name.toLowerCase().replace(/\s+/g, '-');
  const chId = "c-" + Date.now();
  
  db.run("INSERT INTO channels (id, server_id, name) VALUES (?, ?, ?)", [chId, serverId, formattedName], (err) => {
    if (err) return res.status(500).json({ error: "Failed to create channel." });
    res.status(201).json({ id: chId, name: formattedName });
  });
});

// Invite a user to a server
app.post("/api/servers/:serverId/invite", (req, res) => {
  const { username } = req.body;
  const serverId = req.params.serverId;
  
  if (!username) return res.status(400).json({ error: "Username required." });

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!user) return res.status(404).json({ error: "User not found." });
    
    db.run("INSERT OR IGNORE INTO server_members (server_id, username) VALUES (?, ?)", [serverId, username], function(err) {
      if (err) return res.status(500).json({ error: "Failed to invite user." });
      
      if (this.changes > 0) {
        // They were actually added. Let's drop a welcome message in the general channel
        db.get("SELECT id FROM channels WHERE server_id = ? AND name = 'general'", [serverId], (err, ch) => {
          if (ch) {
            const room = `${serverId}-${ch.id}`;
            const text = `${username} hopped into the server!`;
            const ts = new Date().toISOString();
            db.run("INSERT INTO messages (room, username, text, timestamp, isSystem) VALUES (?, 'System', ?, ?, 1)", [room, text, ts], function() {
              io.to(room).emit("receive_message", {
                id: this.lastID || Date.now(),
                username: "System",
                text,
                timestamp: ts,
                isSystem: true,
              });
            });
          }
        });
      }
      res.json({ success: true, username: user.username, color: user.color, avatarUrl: user.avatarUrl });
    });
  });
});

// Get Messages
app.get("/api/messages/:room", (req, res) => {
  const room = req.params.room;
  const query = `
    SELECT m.id, m.room, m.username, m.text, m.timestamp, m.isSystem, m.reply_to_id,
           u.color, u.avatarUrl,
           rm.username AS reply_username, rm.text AS reply_text
    FROM messages m
    LEFT JOIN users u ON m.username = u.username
    LEFT JOIN messages rm ON m.reply_to_id = rm.id
    WHERE m.room = ?
    ORDER BY m.timestamp ASC
  `;
  db.all(query, [room], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch messages." });
    const formatted = rows.map(r => ({
      id: r.id,
      username: r.username,
      text: r.text,
      timestamp: r.timestamp,
      isSystem: r.isSystem === 1,
      color: r.color,
      avatarUrl: r.avatarUrl,
      replyToId: r.reply_to_id || null,
      replyUsername: r.reply_username || null,
      replyText: r.reply_text || null,
    }));
    res.json(formatted);
  });
});

// Get Members for a server
app.get("/api/servers/:serverId/members", (req, res) => {
  const query = `
    SELECT sm.username, u.color, u.avatarUrl
    FROM server_members sm
    JOIN users u ON sm.username = u.username
    WHERE sm.server_id = ?
  `;
  db.all(query, [req.params.serverId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch members" });
    res.json(rows);
  });
});

// Add a friend
app.post("/api/friends", (req, res) => {
  const { username, friendUsername } = req.body;
  if (!username || !friendUsername) return res.status(400).json({ error: "Required fields missing." });
  if (username === friendUsername) return res.status(400).json({ error: "Cannot add yourself." });

  db.get("SELECT * FROM users WHERE username = ?", [friendUsername], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!user) return res.status(404).json({ error: "User not found." });

    const u1 = username < friendUsername ? username : friendUsername;
    const u2 = username > friendUsername ? username : friendUsername;

    db.run("INSERT OR IGNORE INTO friends (user1, user2) VALUES (?, ?)", [u1, u2], (err) => {
      if (err) return res.status(500).json({ error: "Failed to add friend." });
      res.json({ success: true, friend: { username: user.username, color: user.color, avatarUrl: user.avatarUrl } });
    });
  });
});

// Get user's friend list
app.get("/api/friends/:username", (req, res) => {
  const { username } = req.params;
  const query = `
    SELECT u.username, u.color, u.avatarUrl
    FROM friends f
    JOIN users u ON (u.username = f.user1 OR u.username = f.user2)
    WHERE (f.user1 = ? OR f.user2 = ?) AND u.username != ?
  `;
  db.all(query, [username, username, username], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch friends." });
    res.json(rows);
  });
});

// ── WebSockets logic ─────────────────────────────────────────

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const rooms = {};

io.on("connection", (socket) => {
  // Join a room (or switch to a new one)
  socket.on("join_room", ({ room, username, color, avatarUrl }) => {
    if (socket.data.room && socket.data.room !== room) {
      const oldRoom = socket.data.room;
      socket.leave(oldRoom);
      if (rooms[oldRoom]) {
        rooms[oldRoom] = rooms[oldRoom].filter(u => u.username !== socket.data.username);
        io.to(oldRoom).emit("room_users", rooms[oldRoom]);
      }
    }

    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;
    socket.data.color = color;
    socket.data.avatarUrl = avatarUrl;

    // Track server membership only for server rooms (id-id)
    if (!room.startsWith('dm-')) {
      const serverId = room.split('-')[0];
      db.run("INSERT OR IGNORE INTO server_members (server_id, username) VALUES (?, ?)", [serverId, username]);
    }

    if (!rooms[room]) rooms[room] = [];
    
    const existingIndex = rooms[room].findIndex(u => u.username === username);
    if (existingIndex !== -1) {
      rooms[room][existingIndex] = { username, color, avatarUrl };
    } else {
      rooms[room].push({ username, color, avatarUrl });
    }

    io.to(room).emit("room_users", rooms[room]);
  });

  socket.on("update_profile", ({ username, color, avatarUrl }) => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      const idx = rooms[room].findIndex(u => u.username === socket.data.username);
      if (idx !== -1) {
        rooms[room][idx] = { username, color, avatarUrl };
        socket.data.color = color;
        socket.data.avatarUrl = avatarUrl;
        io.to(room).emit("room_users", rooms[room]);
      }
    }
  });

  socket.on("send_message", ({ room, message, replyToId, username: payloadUsername }) => {
    const ts = new Date().toISOString();
    const uname = socket.data.username || payloadUsername || "Unknown";
    db.run(
      "INSERT INTO messages (room, username, text, timestamp, isSystem, reply_to_id) VALUES (?, ?, ?, ?, 0, ?)",
      [room, uname, message, ts, replyToId || null],
      function(err) {
        if (err) { console.error("Error saving message", err); return; }
        const newId = this.lastID || Date.now();
        if (replyToId) {
          db.get("SELECT username, text FROM messages WHERE id = ?", [replyToId], (err, parent) => {
            io.to(room).emit("receive_message", {
              id: newId,
              room: room,
              username: uname,
              color: socket.data.color,
              avatarUrl: socket.data.avatarUrl,
              text: message,
              timestamp: ts,
              isSystem: false,
              replyToId: replyToId,
              replyUsername: parent ? parent.username : null,
              replyText: parent ? parent.text : null,
            });
          });
        } else {
          io.to(room).emit("receive_message", {
            id: newId,
            room: room,
            username: uname,
            color: socket.data.color,
            avatarUrl: socket.data.avatarUrl,
            text: message,
            timestamp: ts,
            isSystem: false,
            replyToId: null,
            replyUsername: null,
            replyText: null,
          });
        }
      }
    );
  });

  socket.on("delete_message", ({ messageId, room }) => {
    const uname = socket.data.username;
    db.get("SELECT username FROM messages WHERE id = ?", [messageId], (err, row) => {
      if (err || !row) return;
      if (row.username !== uname) return; // Only the author can delete
      db.run("DELETE FROM messages WHERE id = ?", [messageId], (err) => {
        if (err) return;
        io.to(room).emit("message_deleted", { id: messageId });
      });
    });
  });

  socket.on("typing", ({ room, username, isTyping }) => {
    socket.to(room).emit("typing_indicator", { username, isTyping });
  });

  socket.on("disconnect", () => {
    const { username, room } = socket.data;
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter(u => u.username !== username);
      io.to(room).emit("room_users", rooms[room]);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 API & Socket server running on ${BASE_URL}`);
});
