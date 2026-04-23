const userStates = new Map();

const USERS = {
  "danil@panelgroup.ru": {
    queue: "DANILVITT",
    assignee: "danil",
    tag: "from_bot_personal",
    bitrixAssignedById: 22
  },
  "timothy@panelgroup.ru": {
    queue: "TIMOFEICHETIN",
    assignee: "timothy",
    tag: "from_bot_personal",
    bitrixAssignedById: 1897
  },
  "daria@panelgroup.ru": {
    queue: "DARIAISAEVA",
    assignee: "daria",
    tag: "from_bot_personal",
    bitrixAssignedById: 3482
  }
};

const TEMPLATE_FILES = {
  card: {
    url: "https://yandex-bot.vercel.app/templates/cartochka.docx",
    filename: "Карточка.docx"
  },
  specification: {
    url: "https://yandex-bot.vercel.app/templates/specification.docx",
    filename: "Спецификация.docx"
  }
};

async function sendBotMessage(login, text, menu = "main") {
  const body = { login, text };

  if (menu === "main") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [
          {
            title: "Трекер: личная задача",
            directives: [{ type: "server_action", name: "create_personal_task" }]
          }
        ],
        [
          {
            title: "CRM: новый лид",
            directives: [{ type: "server_action", name: "create_bitrix_lead" }]
          }
        ],
        [
          {
            title: "Шаблоны",
            directives: [{ type: "server_action", name: "open_templates" }]
          }
        ]
      ]
    };
  }

  if (menu === "templates") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [
          {
            title: "Карточка",
            directives: [{ type: "server_action", name: "send_template_card" }]
          }
        ],
        [
          {
            title: "Спецификация",
            directives: [{ type: "server_action", name: "send_template_specification" }]
          }
        ],
        [
          {
            title: "Назад",
            directives: [{ type: "server_action", name: "back_to_main_menu" }]
          }
        ]
      ]
    };
  }

  await fetch("https://botapi.messenger.yandex.net/bot/v1/messages/sendText/", {
    method: "POST",
    headers: {
      Authorization: `OAuth ${process.env.BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function createTrackerIssue(summary, description, login) {
  const user = USERS[login];
  if (!user) return { ok: false };

  const response = await fetch("https://api.tracker.yandex.net/v3/issues/", {
    method: "POST",
    headers: {
      Authorization: `OAuth ${process.env.OAUTH_TOKEN}`,
      "X-Org-ID": process.env.ORG_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary,
      description,
      queue: user.queue,
      assignee: user.assignee,
      tags: [user.tag]
    })
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

async function createBitrixLead(title, comment, login) {
  const user = USERS[login];

  const response = await fetch(
    `${process.env.BITRIX_WEBHOOK}crm.lead.add.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          TITLE: title,
          COMMENTS: comment,
          ASSIGNED_BY_ID: user?.bitrixAssignedById || 1
        }
      })
    }
  );

  const data = await response.json();
  return { ok: response.ok, data };
}

export default async function handler(req, res) {
  try {
    const update = req.body?.updates?.[0];
    if (!update) return res.status(200).end();

    const login = update?.from?.login;
    const text = (update?.text || "").trim();
    const action = update?.bot_request?.server_action?.name;

    const user = USERS[login];

    // --- КНОПКИ ---
    if (action === "create_personal_task") {
      if (!user) {
        await sendBotMessage(login, "Ты не настроен", "main");
        return res.status(200).end();
      }

      userStates.set(login, { step: "tracker_summary" });

      await sendBotMessage(login, "Напиши название задачи", "none");
      return res.status(200).end();
    }

    if (action === "create_bitrix_lead") {
      if (!user?.bitrixAssignedById) {
        await sendBotMessage(login, "Нет доступа к CRM", "main");
        return res.status(200).end();
      }

      userStates.set(login, { step: "bitrix_title" });

      await sendBotMessage(login, "Введи артикул клиента", "none");
      return res.status(200).end();
    }

    if (action === "open_templates") {
      await sendBotMessage(login, "Выбери шаблон", "templates");
      return res.status(200).end();
    }

    if (action === "back_to_main_menu") {
      await sendBotMessage(login, "Главное меню", "main");
      return res.status(200).end();
    }

    if (action === "send_template_card") {
      await sendBotMessage(login, TEMPLATE_FILES.card.url, "templates");
      return res.status(200).end();
    }

    if (action === "send_template_specification") {
      await sendBotMessage(login, TEMPLATE_FILES.specification.url, "templates");
      return res.status(200).end();
    }

    // --- СОСТОЯНИЯ ---
    const state = userStates.get(login);

    if (!state) {
      await sendBotMessage(login, "Нажми кнопку ниже", "main");
      return res.status(200).end();
    }

    // TRACKER
    if (state.step === "tracker_summary") {
      userStates.set(login, { step: "tracker_description", summary: text });
      await sendBotMessage(login, "Теперь описание задачи", "none");
      return res.status(200).end();
    }

    if (state.step === "tracker_description") {
      userStates.delete(login);

      const result = await createTrackerIssue(state.summary, text, login);

      await sendBotMessage(
        login,
        result.ok ? "Задача создана" : "Ошибка создания задачи",
        "main"
      );

      return res.status(200).end();
    }

    // BITRIX
    if (state.step === "bitrix_title") {
      userStates.set(login, { step: "bitrix_comment", title: text });
      await sendBotMessage(login, "Напиши комментарий", "none");
      return res.status(200).end();
    }

    if (state.step === "bitrix_comment") {
      userStates.delete(login);

      const result = await createBitrixLead(
        state.title,
        text,
        login
      );

      await sendBotMessage(
        login,
        result.ok ? "Лид создан в CRM" : "Ошибка CRM",
        "main"
      );

      return res.status(200).end();
    }

    userStates.delete(login);

    await sendBotMessage(login, "Ошибка, начни заново", "main");

    return res.status(200).end();
  } catch (e) {
    console.log("ERROR:", e);
    return res.status(200).end();
  }
}
