// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Конфигурация NocoDB API
const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "maiff22q0tefj6t";
const VIEW_ID = "vwy5xmvdj8cuwwcx";

// Эндпоинты для работы с записями
const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

// ID поля для загрузки резюме
const SOLUTION_FIELDS = {
    solution: "c8pfbgzvm3ero9x"
};

// Ключ 
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

// Элементы интерфейса
const screens = {
    upload: document.getElementById("uploadScreen"),
    result: document.getElementById("resultScreen")
};

let currentRecordId = null;
let uploadedFiles = [null, null, null];

// Функция аутентификации по tg-id
function getTelegramUserId() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      return user.id;
    }

    Telegram.WebApp.ready();
  }
  return null;
}


document.addEventListener("DOMContentLoaded", async () => {
  Telegram.WebApp.ready();
  const id = getTelegramUserId();
  const startParam = Telegram.WebApp.initDataUnsafe?.start_param;
  console.log("tg-id:", id);
  window.tgUserId = id;
  window.tgUserStartParam = startParam;

  try {
    // Ищем пользователя по Telegram ID
    const userRecord = await findUserByTelegramId();

    if (!userRecord) {
        //Обработка случая, когда пользователь не найден
        showErrorScreen("Напишите нам в боте и мы вам поможем");
        return;
    }

    currentRecordId = userRecord.id;
    // Сразу показываем первый экран загрузки
    showScreen("upload");

  } catch (error) {
    showErrorScreen(error.message)
  }
});

// Функция для показа ошибок
function showErrorScreen(message) {
    // Создаем элементы для отображения ошибки
    const errorScreen = document.createElement("div");
    errorScreen.className = "screen";
    errorScreen.innerHTML = `
        <h2>Произошла ошибка</h2>
        <div class="error-message">${message}</div>
        <button id="closeApp">Закрыть приложение</button>
    `;
    document.body.appendChild(errorScreen);
    
    // Добавляем обработчик закрытия
    document.getElementById("closeApp").addEventListener("click", () => {
        tg.close();
    });
}

// Функции для работы с NocoDB API

/**
    * Поиск пользователя по email в базе NocoDB
    * @param {string} email - Адрес электронной почты
    * @returns {Promise<Object|null>} - Найденная запись или null
    */
async function findUserByTelegramId() {
    try {
        // Формируем запрос с фильтром по email
        const response = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${window.tgUserId})`, {
            method: 'GET',
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json"
            }
        });

        console.log("Telegram User ID:", window.tgUserId);
        console.log("API Request URL:", `${RECORDS_ENDPOINT}?where=(tg-id,eq,${window.tgUserId})&limit=1`);
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("User search response:", data); // Для отладки
        
        if (data.list && data.list.length > 0) {
            const record = data.list[0];
            
            // Добавляем проверку для "Id" (с большой I и маленькой d)
            const recordId = record.id || record.Id || record.ID || record.recordId;
            
            if (!recordId) {
                console.error("ID записи не найден в объекте:", record);
                throw new Error("ID записи не найден");
            }
            
            return {
                id: data.list[0].id,
                ...data.list[0]
            };
        }
        
        return null;
    } catch (error) {
        console.error("Ошибка при поиске пользователя:", error);
        throw new Error("Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.");
    }
}

/**
    * Обновление записи в базе NocoDB
    * @param {string} recordId - ID записи
    * @param {string} fieldId - ID поля для обновления
    * @param {File} file - Файл для загрузки
    * @returns {Promise<boolean>} - Успешно ли обновление
    */
async function updateRecord(recordId, fieldId, file) {
    try {
        // Создаем FormData для отправки файла
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
            const errorText = await uploadResponse.text();
            console.error("Ошибка загрузки файла:", uploadResponse.status, errorText);
            throw new Error(`Ошибка загрузки файла: ${uploadResponse.status}`);
        }
        
        // Получаем данные ответа
        let uploadData = await uploadResponse.json();
        
        // Если ответ - объект, преобразуем в массив
        if (!Array.isArray(uploadData)) {
            uploadData = [uploadData];
        }
        
        // Проверяем наличие signedPath
        if (!uploadData.length || !uploadData[0]?.signedPath) {
            console.error("Не получен signedPath в ответе:", uploadData);
            throw new Error("Не удалось получить информацию о файле");
        }
        
        // Получаем данные о загруженном файле
        const firstItem = uploadData[0];
        const fileName = firstItem.title || file.name;
        const fileType = file.type;
        const fileSize = file.size;
        
        // Определяем иконку по типу файла
        const getFileIcon = (mimeType) => {
            if (mimeType.includes("pdf")) return "mdi-file-pdf-outline";
            if (mimeType.includes("word")) return "mdi-file-word-outline";
            if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "mdi-file-excel-outline";
            if (mimeType.includes("png")) return "mdi-file-image-outline";
            return "mdi-file-outline";
        };
        
        // Формируем данные для поля Attachment
        const attachmentData = [
            {
                mimetype: fileType,
                size: fileSize,
                title: fileName,
                // Используем путь из ответа сервера для скачивания
                url: `${BASE_URL}/${firstItem.path}`,
                icon: getFileIcon(fileType)
            }
        ];
        
        // 2. Формируем данные для обновления записи
        const updateData = Object.assign(
            {
                Id: Number(recordId),
                [fieldId]: attachmentData
            }
        );
        
        console.log("Отправка данных для обновления:", updateData);
        
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
            const errorText = await updateResponse.text();
            console.error("Ошибка обновления записи:", updateResponse.status, errorText);
            throw new Error(`Ошибка обновления записи: ${updateResponse.status}`);
        }
        
        const updateResult = await updateResponse.json();
        console.log("Результат обновления записи:", updateResult);
        
        return true;
        
    } catch (error) {
        console.error("Ошибка при обновлении записи:", error);
        throw new Error("Не удалось сохранить файл. Пожалуйста, попробуйте позже.");
    }
}

// Функции для работы с файлами

/**
    * Валидация файла перед загрузкой
    * @param {File} file - Файл для проверки
    * @returns {string|null} - Сообщение об ошибке или null, если файл валиден
    */
function validateFile(file) {
    if (file.size > 15 * 1024 * 1024) {
        return "Файл слишком большой (макс. 5MB)";
    }
    
    const validTypes = [
        // Документы
        "application/pdf", 
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
        // Таблицы
        "application/vnd.ms-excel", // XLS
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
        "application/vnd.ms-excel.sheet.macroEnabled.12", // XLSM
        "application/vnd.ms-excel.addin.macroEnabled.12",  // XLAM
        // Изображения
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

/**
    * Отслеживание прогресса загрузки файла
    * @param {File} file - Файл для загрузки
    * @param {string} progressId - ID элемента прогресса
    * @param {string} statusId - ID элемента статуса
    * @returns {Promise<void>}
    */
function trackUploadProgress(file, progressId, statusId) {
    return new Promise((resolve) => {
        const progress = document.getElementById(progressId);
        const status = document.getElementById(statusId);
        
        status.textContent = "Подготовка к загрузке...";
        progress.style.width = "0%";
        
        // Имитация прогресса для демонстрации
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

// Функции управления интерфейсом

/**
    * Переключение между экранами приложения
    * @param {string} toScreen - ID экрана для отображения
    */
function showScreen(toScreen) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add("hidden");
    });
    
    // Показываем только целевой экран
    if (screens[toScreen]) {
        screens[toScreen].classList.remove("hidden");
    }
}

/**
    * Отображение сообщения об ошибке
    * @param {HTMLElement} element - Элемент для отображения ошибки
    * @param {string} message - Текст ошибки
    */
function showError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
}

// Обработчики событий

// Обработка загрузки файлов

/**
    * Обработчик загрузки файла
    * @param {number} fileNumber - Номер файла (1, 2 или 3)
    * @param {string} fieldId - ID поля в базе данных
    * @param {string} nextScreen - Следующий экран
    */
async function handleFileUpload(fileNumber, fieldId, nextScreen) {
    const fileInput = document.getElementById(`fileInput${fileNumber}`);
    const errorElement = document.getElementById(`error${fileNumber}`);
    const file = fileInput.files[0];
    
    errorElement.classList.add("hidden");
    
    if (!file) {
        showError(errorElement, "Выберите файл для загрузки");
        return;
    }
    
    // Валидация файла
    const validationError = validateFile(file);
    if (validationError) {
        showError(errorElement, validationError);
        return;
    }
    
    try {
        // Показать прогресс загрузки
        await trackUploadProgress(
            file, 
            `progress${fileNumber}`, 
            `status${fileNumber}`
        );
        
        // Обновление записи в базе данных с дополнительными данными
        await updateRecord(currentRecordId, fieldId, file);
        
        uploadedFiles[fileNumber - 1] = file;
        
        if (nextScreen) {
            showScreen(nextScreen);
        } else {
            showScreen("result");
        }
    } catch (error) {
        showError(errorElement, error.message);
    }
}

// Назначение обработчиков для кнопок загрузки файлов
document.getElementById("submitFile").addEventListener("click", () => {
    handleFileUpload(1, SOLUTION_FIELDS.solution, "upload2");
});

// Закрытие приложения
document.getElementById("closeApp").addEventListener("click", () => {
    tg.close();
});
