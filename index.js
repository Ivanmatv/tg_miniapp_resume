// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Конфигурация NocoDB API
const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";

// ID поля для загрузки файла
const RESUME_FIELD_ID = "cjbp6uf6tb0k528";

// Эндпоинты для работы с записями
const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

// Ключ 
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

// Элементы интерфейса
const screens = {
    upload: document.getElementById("uploadScreen"),
    result: document.getElementById("resultScreen")
};

let currentRecordId = null;

document.addEventListener("DOMContentLoaded", async () => {
  let userId;
  let platform;

  if (window.Telegram && Telegram.WebApp) {
    platform = 'tg';
    window.platform = platform;
    Telegram.WebApp.ready();
    userId = getTelegramUserId();
    console.log("tg-id:", userId);
    window.tgUserId = userId;
  } else if (typeof vkBridge !== 'undefined') {
    platform = 'vk';
    window.platform = platform;
    try {
      await vkBridge.send('VKWebAppInit');
      console.log('VK Mini App initialized');
      const u = await vkBridge.send('VKWebAppGetUserInfo');
      userId = u.id;
      console.log("vk-id:", userId);
      window.vkUserId = userId;
    } catch (err) {
      console.error('VK init error:', err);
      showErrorScreen('Ошибка инициализации VK: ' + err.message);
      return;
    }
  } else {
    showErrorScreen('Платформа не поддерживается');
    return;
  }

  try {
    const userRecord = await findUserByPlatformId(platform, userId);

    if (!userRecord) {
      showErrorScreen("Напишите нам в боте и мы вам поможем");
      return;
    }

    currentRecordId = userRecord.id;
    showScreen("upload");

  } catch (error) {
    showErrorScreen(error.message);
  }
});

// Функция аутентификации по tg-id
function getTelegramUserId() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      return user.id;
    }
  }
  return null;
}

// Функция для показа ошибок
function showErrorScreen(message) {
    const errorScreen = document.createElement("div");
    errorScreen.className = "screen";
    errorScreen.innerHTML = `
        <h2>Произошла ошибка</h2>
        <div class="error-message">${message}</div>
        <button id="closeApp">Закрыть приложение</button>
    `;
    document.body.appendChild(errorScreen);
    
    // Добавляем обработчик закрытия
    const closeFunc = () => {
        if (window.platform === 'tg') {
            tg.close();
        } else if (window.platform === 'vk') {
            vkBridge.send('VKWebAppClose');
        }
    };
    document.getElementById("closeApp").addEventListener("click", closeFunc);
}

// Функции для работы с NocoDB API
async function findUserByPlatformId(platform, userId) {
    try {
        const response = await fetch(`${RECORDS_ENDPOINT}?where=(${platform}-id,eq,${userId})`, {
            method: 'GET',
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.list && data.list.length > 0) {
            const record = data.list[0];
            const recordId = record.id || record.Id || record.ID || record.recordId;
            
            if (!recordId) {
                throw new Error("ID записи не найден");
            }
            
            return {
                id: recordId,
                ...record
            };
        }
        
        return null;
    } catch (error) {
        throw new Error("Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.");
    }
}

async function updateRecord(recordId, file, extraData = {}) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'solutions');
        
        // 1. Загружаем файл
        const uploadResponse = await fetch(FILE_UPLOAD_ENDPOINT, {
            method: 'POST',
            headers: { "xc-token": API_KEY },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`Ошибка загрузки файла: ${uploadResponse.status}`);
        }
        
        // Получаем данные ответа
        let responseData = await uploadResponse.json();
        console.log("Ответ от сервера загрузки файла:", responseData);

        // Обрабатываем возможные форматы ответа
        let fileInfo;
        if (Array.isArray(responseData) && responseData.length > 0) {
            fileInfo = responseData[0];
        } else if (typeof responseData === 'object' && responseData !== null) {
            fileInfo = responseData;
        } else {
            throw new Error("Некорректный формат ответа сервера");
        }

        // Проверяем наличие url
        if (!fileInfo?.url) {
            console.error("Не получен url в ответе:", fileInfo);
            throw new Error("Не удалось получить информацию о файле");
        }
        
        // Получаем данные о загруженном файле из ответа сервера
        const fileName = fileInfo.title;
        const fileType = fileInfo.mimetype;
        const fileSize = fileInfo.size;
        
        const getFileIcon = (mimeType) => {
            if (mimeType.includes("pdf")) return "mdi-file-pdf-outline";
            if (mimeType.includes("word")) return "mdi-file-word-outline";
            if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "mdi-file-excel-outline";
            if (mimeType.includes("png")) return "mdi-file-image-outline";
            return "mdi-file-outline";
        };
        
        const attachmentData = [
            {
                mimetype: fileType,
                size: fileSize,
                title: fileName,
                url: fileInfo.url,
                icon: getFileIcon(fileType)
            }
        ];
        
        // 2. Формируем данные для обновления записи
        const updateData = Object.assign(
            {
                Id: Number(recordId),
                [RESUME_FIELD_ID]: attachmentData
            }
        );
        
        // 3. Отправляем запрос на обновление записи
        const updateResponse = await fetch(RECORDS_ENDPOINT, {
            method: "PATCH",
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify(updateData)
        });
        
        if (!updateResponse.ok) {
            throw new Error(`Ошибка обновления записи: ${updateResponse.status}`);
        }
        
        return true;
        
    } catch (error) {
        throw new Error("Не удалось сохранить файл. Пожалуйста, попробуйте позже.");
    }
}

function validateFile(file) {
    if (file.size > 15 * 1024 * 1024) {
        return "Файл слишком большой (макс. 15MB)";
    }
    
    const validTypes = [
        "application/pdf", 
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp"
    ];
    
    if (!validTypes.includes(file.type)) {
        return "Неподдерживаемый формат файла";
    }
    
    return null;
}

function trackUploadProgress(file, progressId, statusId) {
    return new Promise((resolve) => {
        const progress = document.getElementById(progressId);
        const status = document.getElementById(statusId);
        
        status.textContent = "Подготовка к загрузке...";
        progress.style.width = "0%";
        
        let progressValue = 0;
        const interval = setInterval(() => {
            progressValue += Math.random() * 15;
            if (progressValue >= 100) {
                progressValue = 100;
                clearInterval(interval);
                status.textContent = "Файл загружен!";
                resolve();
            } else {
                progress.style.width = `${progressValue}%`;
                status.textContent = `Загружено ${Math.round(progressValue)}%`;
            }
        }, 200);
    });
}

function showScreen(toScreen) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add("hidden");
    });
    
    if (screens[toScreen]) {
        screens[toScreen].classList.remove("hidden");
    }
}

function showError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
}

// Обработка загрузки файла
async function handleFileUpload() {
    const fileInput = document.getElementById("fileInput");
    const errorElement = document.getElementById("error");
    const file = fileInput.files[0];
    
    errorElement.classList.add("hidden");
    
    if (!file) {
        showError(errorElement, "Выберите файл для загрузки");
        return;
    }
    
    const validationError = validateFile(file);
    if (validationError) {
        showError(errorElement, validationError);
        return;
    }
    
    try {
        await trackUploadProgress(file, "progress", "status");
        
        await updateRecord(currentRecordId, file);
        
        showScreen("result");

    } catch (error) {
        showError(errorElement, error.message);
    }
}

// Назначение обработчиков
document.getElementById("submitFile").addEventListener("click", handleFileUpload);
document.getElementById("closeApp").addEventListener("click", () => {
    tg.close();
});