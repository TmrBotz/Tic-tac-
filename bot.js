const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf("7473136514:AAHo9JfF8Be1qLmbrCiopjT5WhpWxBQABCU");

// Games will be stored as: { "player1_player2": { board, turn, players } }
const games = {};

bot.start((ctx) => {
  ctx.reply(
    `<b>Welcome to Tic Tac Toe Bot!</b>\n\nUse <code>/tictactoe</code> to start a new game in group.`,
    { parse_mode: "HTML" }
  );
});

bot.command("tictactoe", (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("This command only works in groups.");
  }

  const player1 = ctx.from;
  const msg = `<b>${player1.first_name}</b> wants to play Tic Tac Toe!\nClick below to join the game.`;

  ctx.reply(msg, {
    parse_mode: "HTML",
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback("Join Game", `join_${player1.id}`),
    ]),
  });
});

bot.action(/^join_(\d+)/, async (ctx) => {
  const player1_id = ctx.match[1];
  const player2 = ctx.from;
  const player2_id = player2.id;

  if (player1_id == player2_id) {
    return ctx.answerCbQuery("You can't join your own game.");
  }

  const gameId = getGameId(player1_id, player2_id);

  if (games[gameId]) {
    return ctx.answerCbQuery("Game already started!");
  }

  games[gameId] = {
    board: ["", "", "", "", "", "", "", "", ""],
    players: {
      X: parseInt(player1_id),
      O: parseInt(player2_id),
    },
    turn: "X",
  };

  await ctx.editMessageText(
    `<b>Game Started!</b>\n\n<b>X:</b> <a href="tg://user?id=${player1_id}">Player 1</a>\n<b>O:</b> <a href="tg://user?id=${player2_id}">Player 2</a>\n\n<b>X's Turn</b>`,
    {
      parse_mode: "HTML",
      reply_markup: generateBoard(gameId),
    }
  );
});

bot.action(/^[0-8]_[XO]+$/, async (ctx) => {
  const [cell, symbol] = ctx.match[0].split("_");
  const userId = ctx.from.id;

  // Find the correct game
  const gameId = Object.keys(games).find((id) => {
    const game = games[id];
    return game.players[game.turn] === userId && game.turn === symbol;
  });

  if (!gameId) return ctx.answerCbQuery("It's not your turn!");

  const game = games[gameId];
  const board = game.board;

  if (board[cell] !== "") {
    return ctx.answerCbQuery("This cell is already taken.");
  }

  board[cell] = symbol;

  const winner = checkWinner(board);
  const draw = board.every((c) => c !== "");

  if (winner) {
    await ctx.editMessageText(
      `<b>Game Over!</b>\n\n<b>Winner:</b> <a href="tg://user?id=${game.players[winner]}">${winner}</a>`,
      {
        parse_mode: "HTML",
        reply_markup: generateBoard(gameId, true),
      }
    );
    delete games[gameId];
    return;
  }

  if (draw) {
    await ctx.editMessageText(`<b>It's a Draw!</b>`, {
      parse_mode: "HTML",
      reply_markup: generateBoard(gameId, true),
    });
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

// Helpers

function getGameId(p1, p2) {
  return [p1, p2].sort().join("_");
}

function generateBoard(gameId, disabled = false) {
  const game = games[gameId];
  const { board, turn } = game;
  const buttons = [];

  for (let row = 0; row < 3; row++) {
    const btnRow = [];
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      const text = board[i] || "·";
      if (disabled || board[i] !== "") {
        btnRow.push(Markup.button.callback(text, "disabled"));
      } else {
        btnRow.push(Markup.button.callback(text, `${i}_${turn}`));
      }
    }
    buttons.push(btnRow);
  }

  return Markup.inlineKeyboard(buttons);
}

function checkWinner(b) {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  for (const [a, b1, c] of wins) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) {
      return b[a];
    }
  }
  return null;
}

bot.launch();
