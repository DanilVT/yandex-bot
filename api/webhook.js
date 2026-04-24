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
        [{ title: "Трекер: личная задача", directives: [{ type: "server_action", name: "create_personal_task" }] }],
        [{ title: "Трекер: замер / монтаж", directives: [{ type: "server_action", name: "create_montazh_task" }] }],
        [{ title: "CRM: новый лид", directives: [{ type: "server_action", name: "create_bitrix_lead" }] }],
        [{ title: "Шаблоны", directives: [{ type: "server_action", name: "open_templates" }] }]
      ]
    };
  }

  if (menu === "templates") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [{ title: "Карточка", directives: [{ type: "server_action", name: "send_template_card" }] }],
        [{ title: "Спецификация", directives: [{ type: "server_action", name: "send_template_specification" }] }],
        [{ title: "Назад", directives: [{ type: "server_action", name: "back_to_main_menu" }] }]
      ]
    };
  }

  if (menu === "montazh_files") {
    body.suggest_buttons = {
      layout: "true",
      persist: false,
      buttons: [
        [{ title: "Пропустить", directives: [{ type: "server_action", name: "skip_montazh_files" }] }]
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

function getFilesFromUpdate(update) {
  const files = [];

  if (update?.file?.id) {
    files.push({
      id: update.file.id,
      name: update.file.name || "file",
      size: update.file.size || null
    });
  }

  if (Array.isArray(update?.images)) {
    for (const imageGroup of update.images) {
      if (!Array.isArray(imageGroup) || imageGroup.length === 0) continue;

      const original = imageGroup[imageGroup.length - 1];

      if (original?.file_id) {
        files.push({
          id: original.file_id,
          name: original.name || "image.jpeg",
          size: original.size || null
        });
      }
    }
  }

  return files;
}

async function downloadMessengerFile(fileId) {
  const response = await fetch(
    "https://botapi.messenger.yandex.net/bot/v1/messages/getFile/",
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${process.env.BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_id: fileId
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.log("MESSENGER GET FILE ERROR:", response.status, errorText);
    throw new Error(`Не удалось скачать файл из Мессенджера: ${response.status}`);
  }

  return await response.arrayBuffer();
}

async function attachFileToTrackerIssue(issueKey, fileId, filename) {
  const fileBuffer = await downloadMessengerFile(fileId);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileBuffer]),
    filename
  );

  const response = await fetch(
    `https://api.tracker.yandex.net/v3/issues/${issueKey}/attachments/?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${process.env.OAUTH_TOKEN}`,
        "X-Org-ID": process.env.ORG_ID
      },
      body: formData
    }
  );

  const resultText = await response.text();
  console.log("TRACKER ATTACHMENT RESPONSE:", response.status, resultText);

  return {
    ok: response.ok,
    status: response.status,
    raw: resultText
  };
}

async function attachFilesToTrackerIssue(issueKey, files) {
  const results = [];

  for (const file of files) {
    try {
      const result = await attachFileToTrackerIssue(
        issueKey,
        file.id,
        file.name || "file"
      );

      results.push(result);
    } catch (error) {
      console.log("ATTACH FILE ERROR:", error?.message || error);
      results.push({
        ok: false,
        status: 0,
        raw: error?.message || "attach_error"
      });
    }
  }

  return results;
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

async function createMontazhIssue(article, address, volume, hasFiles = false) {
  const description = `Адрес: ${address}

Объём замера / монтажа: ${volume}${hasFiles ? "\n\nФайл: есть, смотри вложения в самом конце" : ""}`;

  const response = await fetch("https://api.tracker.yandex.net/v3/issues/", {
    method: "POST",
    headers: {
      Authorization: `OAuth ${process.env.OAUTH_TOKEN}`,
      "X-Org-ID": process.env.ORG_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: article,
      description,
      queue: "MONTAZH",
      assignee: "danil",
      tags: ["montazh_from_bot"]
    })
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

async function createBitrixLead(title, comment, login) {
  const user = USERS[login];

  const response = await fetch(`${process.env.BITRIX_WEBHOOK}crm.lead.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        TITLE: title,
        COMMENTS: comment,
        ASSIGNED_BY_ID: user?.bitrixAssignedById || 1
      }
    })
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

export default async function handler(req, res) {
  try {
    console.log("FULL UPDATE:", JSON.stringify(req.body, null, 2));

    const update = req.body?.updates?.[0];
    if (!update) return res.status(200).end();

    if (update?.attachments) {
      console.log("ATTACHMENTS:", JSON.stringify(update.attachments, null, 2));
    }

    if (update?.files) {
      console.log("FILES:", JSON.stringify(update.files, null, 2));
    }

    if (update?.message?.attachments) {
      console.log("MESSAGE ATTACHMENTS:", JSON.stringify(update.message.attachments, null, 2));
    }

    if (update?.file) {
      console.log("UPDATE FILE:", JSON.stringify(update.file, null, 2));
    }

    if (update?.images) {
      console.log("UPDATE IMAGES:", JSON.stringify(update.images, null, 2));
    }

    const login = update?.from?.login;
    const text = (update?.text || "").trim();
    const action = update?.bot_request?.server_action?.name;

    const user = USERS[login];

    if (action === "create_personal_task") {
      if (!user) {
        await sendBotMessage(login, "Ты не настроен", "main");
        return res.status(200).end();
      }

      userStates.set(login, { step: "tracker_summary" });
      await sendBotMessage(login, "Напиши название задачи", "none");
      return res.status(200).end();
    }

    if (action === "create_montazh_task") {
      userStates.set(login, { step: "montazh_article" });
      await sendBotMessage(login, "Введите название задачи\nПример: Замер (артикул)", "none");
      return res.status(200).end();
    }

    if (action === "skip_montazh_files") {
      const state = userStates.get(login);

      if (!state || state.step !== "montazh_files") {
        await sendBotMessage(login, "Нажми кнопку ниже", "main");
        return res.status(200).end();
      }

      userStates.delete(login);

      const result = await createMontazhIssue(
        state.article,
        state.address,
        state.volume,
        false
      );

      await sendBotMessage(
        login,
        result.ok ? "Задача по замеру / монтажу создана" : "Ошибка создания задачи",
        "main"
      );

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

    const state = userStates.get(login);

    if (!state) {
      await sendBotMessage(login, "Нажми кнопку ниже", "main");
      return res.status(200).end();
    }

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
        result.ok 
          ? `Задача создана: ${result.data.key}`
          : "Ошибка создания задачи",
        "main"
      );

      return res.status(200).end();
    }

    if (state.step === "montazh_article") {
      userStates.set(login, {
        step: "montazh_address",
        article: text
      });

      await sendBotMessage(login, "Введи адрес замера / монтажа", "none");
      return res.status(200).end();
    }

    if (state.step === "montazh_address") {
      userStates.set(login, {
        step: "montazh_volume",
        article: state.article,
        address: text
      });

      await sendBotMessage(login, "Введи объём замера / монтажа", "none");
      return res.status(200).end();
    }

    if (state.step === "montazh_volume") {
      userStates.set(login, {
        step: "montazh_files",
        article: state.article,
        address: state.address,
        volume: text
      });

      await sendBotMessage(
        login,
        "Прикрепи файлы или нажми кнопку «Пропустить»",
        "montazh_files"
      );

      return res.status(200).end();
    }

    if (state.step === "montazh_files") {
      userStates.delete(login);

      const files = getFilesFromUpdate(update);
      const hasFiles = files.length > 0;

      const result = await createMontazhIssue(
        state.article,
        state.address,
        state.volume,
        hasFiles
      );

      if (result.ok && result?.data?.key && hasFiles) {
        const attachResults = await attachFilesToTrackerIssue(
          result.data.key,
          files
        );

        const attachedCount = attachResults.filter((item) => item.ok).length;

        await sendBotMessage(
          login,
          attachedCount === files.length
            ? `Задача по замеру / монтажу создана. Файлов прикреплено: ${attachedCount}`
            : `Задача создана, но часть файлов не прикрепилась. Прикреплено: ${attachedCount} из ${files.length}`,
          "main"
        );

        return res.status(200).end();
      }

      await sendBotMessage(
        login,
        result.ok ? "Задача по замеру / монтажу создана" : "Ошибка создания задачи",
        "main"
      );

      return res.status(200).end();
    }

    if (state.step === "bitrix_title") {
      userStates.set(login, { step: "bitrix_comment", title: text });
      await sendBotMessage(login, "Напиши комментарий", "none");
      return res.status(200).end();
    }

    if (state.step === "bitrix_comment") {
      userStates.delete(login);

      const result = await createBitrixLead(state.title, text, login);

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
