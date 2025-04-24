const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf("7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU");

const games = {};
const pendingGames = {};

function getGameId(chatId, p1, p2) {
  return `${chatId}_${[p1, p2].sort().join("_")}`;
}

function generateBoard(gameId) {
  const game = games[gameId];
  const { board } = game;

  const buttons = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) {
      const index = i * 3 + j;
      row.push(
        Markup.button.callback(
          board[index] || ".",
          `${gameId}_${index}`
        )
      );
    }
    buttons.push(row);
  }

  return Markup.inlineKeyboard(buttons);
}

function checkWinner(board, symbol) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  return winPatterns.some(pattern =>
    pattern.every(index => board[index] === symbol)
  );
}

function isDraw(board) {
  return board.every(cell => cell !== "");
}

bot.command("start", (ctx) => {
  ctx.reply(
    `<b>Welcome to Tic Tac Toe Bot!</b>\n\nUse /tictactoe in a group to start a game.`,
    { parse_mode: "HTML" }
  );
});

bot.command("tictactoe", (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("This command only works in groups.");
  }

  const chatId = ctx.chat.id;
  const player1 = ctx.from;

  pendingGames[chatId] = player1.id;

  ctx.reply(
    `<b>${player1.first_name}</b> wants to play Tic Tac Toe!\nClick below to join the game.`,
    {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback("Join Game", `join_${chatId}_${player1.id}`)
      ])
    }
  );
});

bot.action(/^join_(\-?\d+)_(\d+)/, async (ctx) => {
  const [_, chatId, player1Id] = ctx.match;
  const player2 = ctx.from;

  if (player2.id == player1Id) {
    return ctx.answerCbQuery("You can't join your own game.");
  }

  const gameId = getGameId(chatId, player1Id, player2.id);

  if (games[gameId]) {
    return ctx.answerCbQuery("Game already in progress!");
  }

  games[gameId] = {
    board: Array(9).fill(""),
    players: {
      X: parseInt(player1Id),
      O: player2.id,
    },
    turn: "X",
  };

  await ctx.editMessageText(
    `<b>Game Started!</b>\n\n<b>X:</b> <a href="tg://user?id=${player1Id}">Player 1</a>\n<b>O:</b> <a href="tg://user?id=${player2.id}">Player 2</a>\n\n<b>X's Turn</b>`,
    {
      parse_mode: "HTML",
      reply_markup: generateBoard(gameId),
    }
  );
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (!data.includes("_")) return;

  const parts = data.split("_");
  const chatId = ctx.chat.id;
  const gameId = `${parts[0]}_${parts[1]}_${parts[2]}`;
  const index = parseInt(parts[3]);

  const game = games[gameId];
  if (!game) return ctx.answerCbQuery("Game not found!");

  const playerId = ctx.from.id;
  const symbol = Object.entries(game.players).find(([s, id]) => id === playerId)?.[0];

  if (!symbol) return ctx.answerCbQuery("You're not part of this game.");
  if (game.players[game.turn] !== playerId) return ctx.answerCbQuery("It's not your turn.");
  if (game.board[index]) return ctx.answerCbQuery("Cell already taken.");

  game.board[index] = symbol;

  if (checkWinner(game.board, symbol)) {
    await ctx.editMessageText(
      `<b>${symbol} wins!</b>`,
      { parse_mode: "HTML" }
    );
    delete games[gameId];
    return;
  }

  if (isDraw(game.board)) {
    await ctx.editMessageText(`<b>It's a draw!</b>`, { parse_mode: "HTML" });
    delete games[gameId];
    return;
  }

  game.turn = game.turn === "X" ? "O" : "X";

  await ctx.editMessageText(
    `<b>Game In Progress</b>\n\n<b>X:</b> <a href="tg://user?id=${game.players.X}">Player 1</a>\n<b>O:</b> <a href="tg://user?id=${game.players.O}">Player 2</a>\n\n<b>${game.turn}'s Turn</b>`,
    {
      parse_mode: "HTML",
      reply_markup: generateBoard(gameId),
    }
  );
});

bot.launch();
