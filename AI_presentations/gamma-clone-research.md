# 🚀 Пет-проект: AI-генератор презентаций на базе Claude
### Полное исследование: продукт, технологии, маркетинг, монетизация

> **Цель:** Создать MVP аналога Gamma — AI-сервиса для генерации презентаций — с минимальным функционалом, реальной монетизацией и понятной стратегией выхода на рынок.

---

## Содержание

1. [Анализ рынка и позиционирование](#1-анализ-рынка-и-позиционирование)
2. [Продукт: минимальный функционал (MVP)](#2-продукт-минимальный-функционал-mvp)
3. [Технологический стек](#3-технологический-стек)
4. [Архитектура системы](#4-архитектура-системы)
5. [Промпт-инжиниринг: ядро продукта](#5-промпт-инжиниринг-ядро-продукта)
6. [Маркетинг и продвижение](#6-маркетинг-и-продвижение)
7. [Монетизация](#7-монетизация)
8. [Роадмап запуска](#8-роадмап-запуска)
9. [Риски и как их митигировать](#9-риски-и-как-их-митигировать)
10. [Финансовая модель](#10-финансовая-модель)

---

## 1. Анализ рынка и позиционирование

### Почему ниша всё ещё открыта

Gamma захватила $100M ARR, но это **глобальный рынок**. Существуют незаполненные сегменты:

- **Русскоязычный рынок** — Gamma работает, но не локализована под СНГ, нет поддержки кириллических шрифтов "из коробки", нет рублёвой оплаты
- **Вертикальные ниши** — презентации для конкретных индустрий (стартапы, консалтинг, образование, HR)
- **Ценовой сегмент** — $8-18/мес. для многих рынков дорого; есть спрос на более дешёвый аналог

### Конкурентный ландшафт

| Продукт | ARR | Сильные стороны | Слабые стороны |
|---|---|---|---|
| Gamma | $100M | UX, AI агент, экосистема | Дорого, не локализован |
| Tome | $3.5M | Дизайн | Плохая монетизация, умирает |
| Beautiful.ai | ~$30M | Шаблоны | Нет AI-генерации с нуля |
| Canva AI | часть $2.55B | Экосистема, бренд | Перегружен, не специализирован |
| **Ваш продукт** | 0 → цель | Ниша, локализация, цена | Нет бренда |

### Позиционирование MVP

**Формула:** "Опиши идею — получи презентацию за 30 секунд"

Не пытайтесь конкурировать с Gamma по фичам. Выигрывайте по **скорости запуска**, **локализации** и **простоте**.

---

## 2. Продукт: минимальный функционал (MVP)

### Принцип: меньше — лучше

Gamma потратила годы на текущий продукт. Ваша задача — запустить **рабочий продукт за 4-6 недель** и проверить спрос.

### Что входит в MVP (и только это)

#### ✅ Фича 1: Генерация презентации из текстового промпта
- Пользователь вводит тему и несколько ключевых тезисов
- Claude генерирует структуру (5-10 слайдов)
- Каждый слайд: заголовок + 3-5 буллетов + рекомендация по картинке

#### ✅ Фича 2: Выбор темы оформления
- 3-5 готовых цветовых схем (светлая, тёмная, корпоративная, минималистичная, яркая)
- Одна шрифтовая пара на каждую тему
- Никакого кастомного дизайна в MVP

#### ✅ Фича 3: Просмотр в браузере
- Слайды рендерятся как HTML-страницы прямо в браузере
- Полноэкранный режим (нажать F или кнопку)
- Навигация стрелками

#### ✅ Фича 4: Экспорт
- Скачать как **PDF** (через Puppeteer — headless Chrome)
- Скачать как **PPTX** (через `pptxgenjs` — нативный формат PowerPoint)
- Ссылка для шаринга (публичный URL с ID презентации)

> **Почему PPTX обязателен с первого дня:** корпоративная аудитория отправляет именно .pptx, а не PDF. Без него продукт не встраивается в рабочий процесс — пользователи уходят доделывать вручную. `pptxgenjs` позволяет реализовать базовый экспорт (заголовок + буллеты + тема) за 1-2 дня.

#### ✅ Фича 5: AI-допромптинг отдельного слайда

Это убийственная фича для MVP. Пользователь нажимает на любой слайд и пишет:
- "Сделай более формальным"
- "Добавь статистику"
- "Перепиши под аудиторию инвесторов"
- "Сократи до 3 буллетов"

Claude получает **только этот слайд + инструкцию** и возвращает обновлённую версию. Остальные слайды не трогаются.

**Почему это важно:**
- Полноценный drag & drop редактор — месяцы работы
- AI-допромптинг одного слайда — 2-3 дня работы
- Даёт пользователю ощущение контроля без сложного UI
- Это то, ради чего апгрейдятся с бесплатного плана

**Реализация:**

```javascript
// /api/refine-slide/route.ts
export async function POST(req: Request) {
  const { slide, instruction, presentationContext } = await req.json();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: `Ты редактируешь ОДИН слайд презентации по инструкции пользователя.
Верни ТОЛЬКО JSON этого слайда в том же формате. Никакого текста вне JSON.
Сохраняй структуру (type, index). Меняй только содержимое (title, bullets и т.д.).`,
    messages: [{
      role: 'user',
      content: `Презентация о: "${presentationContext.title}"
      
Текущий слайд:
${JSON.stringify(slide, null, 2)}

Инструкция пользователя: "${instruction}"

Верни обновлённый слайд в том же JSON формате.`
    }]
  });

  const refined = JSON.parse(message.content[0].text);
  return Response.json({ slide: refined });
}
```

**UI паттерн:** при клике на слайд появляется панель снизу с текстовым полем "Изменить этот слайд..." + кнопка применить. Spinner на слайде пока идёт запрос (~5-8 сек). Никакого сложного интерфейса.

#### ✅ Фича 6: Нативная регистрация (progressive disclosure)

Регистрация появляется **только в нужный момент** — не в начале. Человек сначала видит ценность, потом регистрируется.

```
Промпт на главной → генерация → просмотр презентации
                                       ↓
                          Хочет скачать PDF/PPTX?
                          Хочет допромптить слайд?
                          Хочет сохранить?
                                       ↓
                          Модальное окно: "Сохраните результат"
                          Email + пароль (или Google)
                                       ↓
                          Presentation привязывается к аккаунту
```

**Технически:** анонимная сессия через `request.session.session_key` в Django. При регистрации — `Presentation.objects.filter(session_key=...).update(user=new_user)`.

Просто смотреть можно без регистрации. Регистрация нужна только для действий с ценностью.

### Что НЕ входит в MVP (отложить)

- ❌ Редактор слайдов (drag & drop)
- ❌ Загрузка своих изображений
- ❌ Командная работа
- ❌ Кастомный брендинг
- ❌ Аналитика просмотров

### Пользовательский флоу (MVP)

```
Лендинг — промпт прямо на главной странице
  → Генерация (30 сек, прогресс-бар) — без регистрации
    → Просмотр презентации в браузере — без регистрации
      → Клик на слайд → "Изменить этот слайд..." → модалка регистрации
      → "Скачать PDF / PPTX" → модалка регистрации
      → "Сохранить" → модалка регистрации
        → После регистрации: презентация привязывается к аккаунту
          → Дашборд с сохранёнными презентациями
```

**Ключевой принцип:** человек уже вложил время, увидел результат — теперь ему есть что терять. Конверсия в регистрацию в этой точке в 3-5× выше, чем до генерации.

---

## 3. Технологический стек

### Выбор стека: принципы

Для пет-проекта важно:
1. **Быстро запустить** — выбирайте то, что знаете
2. **Низкие расходы на старте** — не платить за инфраструктуру, пока нет юзеров
3. **Масштабируемость** — не переписывать с нуля при росте

Стек выбран под то, что вы уже знаете: **Python Django + React**.

### Рекомендуемый стек

#### Frontend

```
React 18 (Vite)
├── Tailwind CSS        — стилизация
├── shadcn/ui           — готовые UI-компоненты
├── Framer Motion       — анимации переходов между слайдами
├── Reveal.js           — рендер презентаций в браузере
└── React Router v6     — роутинг (SPA)
```

Vite даёт быстрый dev-сервер и простую сборку. React деплоится на Vercel или Cloudflare Pages бесплатно.

#### Backend

```
Django 5 + Django REST Framework
├── /api/generate/        — генерация презентации через Claude
├── /api/presentations/   — CRUD презентаций
├── /api/refine-slide/    — AI-допромптинг одного слайда
├── /api/export/pdf/      — генерация PDF
├── /api/export/pptx/     — генерация PPTX
├── /api/auth/            — JWT аутентификация
└── /api/billing/webhook/ — Stripe webhooks
```

**Ключевые пакеты:**

```
djangorestframework         — REST API
djangorestframework-simplejwt — JWT токены
django-cors-headers         — CORS для React
anthropic                   — Claude SDK
python-pptx                 — генерация PPTX (нативный Python)
weasyprint                  — генерация PDF из HTML
stripe                      — платежи
django-storages + boto3     — хранение файлов (S3/R2)
celery + redis              — фоновые задачи (экспорт PDF/PPTX)
```

#### База данных

```
PostgreSQL
├── users            — стандартная Django auth
├── presentations    — презентации (slides хранится как JSONField)
├── subscriptions    — план пользователя, статус Stripe
└── usage_logs       — трекинг генераций и допромптинга
```

Django ORM + миграции — удобно для управления подписками и лимитами. Хостинг БД: **Railway** (бесплатный тир) или **Neon** (Postgres serverless, бесплатно).

#### AI: Claude API

```
anthropic Python SDK
├── Модель: claude-sonnet-4-5 (баланс цены и качества)
├── Использование: генерация JSON структуры + допромптинг слайдов
└── Стратегия: structured output через системный промпт
```

#### Рендеринг и экспорт

```
Reveal.js    — HTML-презентации в браузере (JS, open source)
python-pptx  — генерация .pptx (нативный Python, без зависимостей)
weasyprint   — генерация PDF из HTML-шаблона Django
```

**python-pptx — базовый пример:**

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import io

THEMES = {
    'dark':      {'bg': '1a1a2e', 'text': 'eeeeee', 'accent': '6c63ff'},
    'light':     {'bg': 'ffffff', 'text': '333333', 'accent': '2563eb'},
    'corporate': {'bg': '0f172a', 'text': 'f8fafc', 'accent': '0ea5e9'},
    'minimal':   {'bg': 'fafafa', 'text': '111111', 'accent': '000000'},
    'vibrant':   {'bg': '7c3aed', 'text': 'ffffff', 'accent': 'fbbf24'},
}

def generate_pptx(presentation_data: dict) -> bytes:
    prs = Presentation()
    prs.slide_width  = Inches(13.33)
    prs.slide_height = Inches(7.5)

    theme = THEMES.get(presentation_data.get('theme', 'light'))
    bg_color     = RGBColor.from_string(theme['bg'])
    text_color   = RGBColor.from_string(theme['text'])
    accent_color = RGBColor.from_string(theme['accent'])

    blank_layout = prs.slide_layouts[6]  # пустой layout

    for slide_data in presentation_data['slides']:
        slide = prs.slides.add_slide(blank_layout)

        # Фон
        background = slide.background
        fill = background.fill
        fill.solid()
        fill.fore_color.rgb = bg_color

        if slide_data['type'] == 'title':
            # Заголовок
            txBox = slide.shapes.add_textbox(Inches(0.5), Inches(2), Inches(12), Inches(1.5))
            tf = txBox.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = slide_data['title']
            p.runs[0].font.size = Pt(40)
            p.runs[0].font.bold = True
            p.runs[0].font.color.rgb = text_color
            p.alignment = 2  # CENTER

            # Подзаголовок
            txBox2 = slide.shapes.add_textbox(Inches(0.5), Inches(3.8), Inches(12), Inches(1))
            tf2 = txBox2.text_frame
            p2 = tf2.paragraphs[0]
            p2.text = slide_data.get('subtitle', '')
            p2.runs[0].font.size = Pt(20)
            p2.runs[0].font.color.rgb = accent_color
            p2.alignment = 2

        elif slide_data['type'] == 'content':
            # Заголовок слайда
            txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(12), Inches(1))
            tf = txBox.text_frame
            p = tf.paragraphs[0]
            p.text = slide_data['title']
            p.runs[0].font.size = Pt(28)
            p.runs[0].font.bold = True
            p.runs[0].font.color.rgb = text_color

            # Буллеты
            txBox2 = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(12), Inches(5))
            tf2 = txBox2.text_frame
            tf2.word_wrap = True
            for i, bullet in enumerate(slide_data.get('bullets', [])):
                p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
                p.text = f'• {bullet}'
                p.runs[0].font.size = Pt(18)
                p.runs[0].font.color.rgb = text_color
                p.space_after = Pt(8)

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
```

**weasyprint — PDF из HTML-шаблона:**

```python
from weasyprint import HTML
from django.template.loader import render_to_string

def generate_pdf(presentation_data: dict) -> bytes:
    html_string = render_to_string('exports/presentation.html', {
        'presentation': presentation_data,
        'theme': THEMES[presentation_data.get('theme', 'light')]
    })
    return HTML(string=html_string).write_pdf()
```

#### Инфраструктура

```
Vercel / Cloudflare Pages  — хостинг React (бесплатно)
Railway                    — хостинг Django + PostgreSQL (бесплатный тир)
Redis (Railway)            — Celery broker для фоновых задач
Cloudflare R2              — хранение PDF/PPTX ($0.015/GB)
Resend                     — транзакционные письма (бесплатно до 3000/мес)
```

**Итоговая стоимость инфраструктуры при 0 пользователях: $0/мес**
**При 100 активных пользователях: ~$10-20/мес**

#### Оплата

Stripe напрямую недоступен без иностранного юрлица — используем два провайдера под разные рынки. Подробная схема подключения в разделе [7. Монетизация и приём платежей](#7-монетизация).

```
Россия:   ЮKassa — рублёвые подписки (карты РФ, СБП, ЮMoney)
Зарубеж:  LemonSqueezy — валютные подписки (Merchant of Record, без юрлица)
```

---

## 4. Архитектура системы

### Схема компонентов

```
┌─────────────────────────────────────────────────────────┐
│                      Пользователь                        │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS
          ┌───────────────┴──────────────┐
          │                              │
┌─────────▼──────────┐       ┌──────────▼───────────────┐
│  React (Vite)      │       │  Django REST Framework    │
│  Vercel/CF Pages   │◄─────►│  Railway                  │
│                    │  API  │                            │
│  Reveal.js         │       │  /api/generate/            │
│  Tailwind          │       │  /api/refine-slide/        │
│  shadcn/ui         │       │  /api/export/pptx/         │
└────────────────────┘       │  /api/export/pdf/          │
                             │  /api/billing/webhook/     │
                             └──────────┬────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────┐
              │                         │                  │
   ┌──────────▼──────┐    ┌────────────▼──────┐  ┌────────▼──────┐
   │   Claude API    │    │   PostgreSQL       │  │ Cloudflare R2 │
   │   (генерация)   │    │   (Railway)        │  │ (PDF, PPTX)   │
   └─────────────────┘    └───────────────────┘  └───────────────┘
                                        │
                          ┌─────────────▼──────┐
                          │  Stripe             │
                          │  (подписки)         │
                          └────────────────────┘
```

### Структура Django проекта

```
backend/
├── config/
│   ├── settings.py
│   ├── urls.py
│   └── celery.py
├── apps/
│   ├── users/           — кастомная модель юзера, JWT auth
│   ├── presentations/   — модели + views для CRUD
│   ├── generation/      — Claude API интеграция
│   ├── exports/         — python-pptx, weasyprint
│   └── billing/         — Stripe подписки, webhooks
└── requirements.txt
```

### Django модели

```python
# apps/presentations/models.py
from django.db import models
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class Presentation(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user       = models.ForeignKey(User, on_delete=models.CASCADE,
                                   null=True, blank=True)  # null = анонимный
    title      = models.CharField(max_length=255)
    theme      = models.CharField(max_length=50, default='light')
    slides     = models.JSONField()                        # весь контент здесь
    is_public  = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class UsageLog(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE)
    action     = models.CharField(max_length=50)  # 'generate' | 'refine'
    created_at = models.DateTimeField(auto_now_add=True)


class Subscription(models.Model):
    PLANS = [('free', 'Free'), ('student', 'Student'), ('pro', 'Pro')]

    user              = models.OneToOneField(User, on_delete=models.CASCADE)
    plan              = models.CharField(max_length=20, choices=PLANS, default='free')
    stripe_customer   = models.CharField(max_length=100, blank=True)
    stripe_sub_id     = models.CharField(max_length=100, blank=True)
    current_period_end = models.DateTimeField(null=True)
```

### Поток генерации (с progressive disclosure)

```
1. Пользователь → POST /api/generate/ { prompt, theme, slides_count }
   (без авторизации — session_key из cookie)
2. Django: создаём Presentation с user=None, session=session_key
3. Claude API → JSON структура презентации
4. Сохранить в БД, вернуть presentation_id
5. React: рендерит через Reveal.js
6. Пользователь хочет скачать/сохранить?
   → Показываем модальное окно регистрации
   → После регистрации: Presentation.user = новый юзер
7. Экспорт → Celery task → python-pptx / weasyprint → R2 → ссылка
```

### Структура данных презентации (JSON)

```json
{
  "id": "uuid",
  "title": "Моя презентация",
  "theme": "dark",
  "created_at": "2025-01-01T00:00:00Z",
  "user_id": "uuid",
  "slides": [
    {
      "index": 0,
      "type": "title",
      "title": "Заголовок презентации",
      "subtitle": "Подзаголовок или имя автора",
      "speaker_notes": ""
    },
    {
      "index": 1,
      "type": "content",
      "title": "Проблема",
      "bullets": [
        "Пункт один с конкретным фактом",
        "Второй важный тезис",
        "Третий аргумент"
      ],
      "image_suggestion": "person frustrated with paperwork",
      "speaker_notes": "Подсказка для спикера"
    },
    {
      "index": 2,
      "type": "split",
      "title": "Наше решение",
      "left": { "heading": "Было", "text": "..." },
      "right": { "heading": "Стало", "text": "..." }
    }
  ]
}
```

---

## 5. Промпт-инжиниринг: ядро продукта

Это самая важная часть. Качество генерации определяет всё.

### Системный промпт

```
Ты — эксперт по созданию бизнес-презентаций. Ты создаёшь чёткие, 
убедительные и визуально выразимые презентации. 

ПРАВИЛА:
1. Каждый слайд должен иметь ОДНУ главную мысль
2. Буллеты — короткие (максимум 10 слов каждый)
3. Факты и цифры делают презентацию убедительнее — добавляй их
4. Структура по пирамиде Минто: главная идея → аргументы → детали
5. Всегда заканчивай слайдом с призывом к действию или выводом

ЗАПРЕЩЕНО:
- Длинные абзацы на слайдах
- Больше 5 буллетов на слайде
- Абстрактные формулировки без конкретики

Отвечай ТОЛЬКО валидным JSON в указанном формате. Никакого markdown, 
никакого текста вне JSON.
```

### Пользовательский промпт (шаблон)

```python
# apps/generation/prompts.py

def build_prompt(topic: str, context: str = '', audience: str = '',
                 slides_count: int = 8, tone: str = '', language: str = 'русский') -> str:
    return f"""
Создай презентацию на тему: "{topic}"

Дополнительный контекст: {context or 'не указан'}
Целевая аудитория: {audience or 'широкая бизнес-аудитория'}
Количество слайдов: {slides_count}
Тон: {tone or 'профессиональный, но доступный'}
Язык: {language}

Верни JSON строго в следующем формате:
{{
  "title": "название презентации",
  "slides": [
    {{
      "index": 0,
      "type": "title",
      "title": "...",
      "subtitle": "..."
    }},
    {{
      "index": 1,
      "type": "content",
      "title": "...",
      "bullets": ["...", "...", "..."],
      "image_suggestion": "описание изображения на английском"
    }}
  ]
}}

Типы слайдов: "title", "content", "two_column", "quote", "stats", "cta"
"""
```

### Claude-адаптер: CLI vs API режим

Это первое, что нужно написать — до всех views. Позволяет разрабатывать и отлаживать логику без трат на API.

```python
# apps/generation/claude_client.py
import os
import sys
import anthropic

def call_claude(system_prompt: str, user_prompt: str) -> str:
    """
    Универсальная функция вызова Claude.
    Переключается через env-переменную CLAUDE_MODE:

      CLAUDE_MODE=cli  — интерактивный режим в терминале (бесплатно, для отладки)
      CLAUDE_MODE=api  — реальный запрос к Anthropic (по умолчанию)

    Запуск:
      CLAUDE_MODE=cli python manage.py shell
      CLAUDE_MODE=api python manage.py shell
    """
    mode = os.getenv('CLAUDE_MODE', 'api')

    if mode == 'cli':
        # Показываем промпты в терминале
        print("\n" + "=" * 60)
        print("SYSTEM PROMPT:")
        print(system_prompt[:300] + ("..." if len(system_prompt) > 300 else ""))
        print("-" * 60)
        print("USER PROMPT:")
        print(user_prompt[:800] + ("..." if len(user_prompt) > 800 else ""))
        print("=" * 60)
        print("Введите JSON-ответ (пустая строка = конец ввода):")

        lines = []
        while True:
            line = input()
            if line == "":
                break
            lines.append(line)
        return "\n".join(lines)

    # api режим — реальный Claude
    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    message = client.messages.create(
        model='claude-sonnet-4-5',
        max_tokens=4096,
        system=system_prompt,
        messages=[{'role': 'user', 'content': user_prompt}]
    )
    return message.content[0].text
```

**Зачем это нужно:**
- Отлаживаете парсинг JSON и логику рендера без расходов на API
- Вставляете заготовленный JSON — тестируете что угодно мгновенно
- Легко мокировать в тестах: `CLAUDE_MODE=cli` + заранее написанный ответ
- Переключение одной переменной — не нужно менять код

**Пример использования в тестах:**

```python
# tests/test_generation.py
import os
from unittest.mock import patch
from io import StringIO

def test_generate_parses_json_correctly():
    mock_response = '''{"title": "Тест", "slides": [
        {"index": 0, "type": "title", "title": "Заголовок", "subtitle": "Подзаголовок"}
    ]}'''

    with patch.dict(os.environ, {'CLAUDE_MODE': 'cli'}):
        with patch('builtins.input', side_effect=mock_response.split('\n') + ['']):
            from apps.generation.claude_client import call_claude
            result = call_claude("system", "user")
            assert '"title": "Тест"' in result
```

### Вызов Claude API (Django view)

```python
# apps/generation/views.py
import json
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .claude_client import call_claude          # ← адаптер, не прямой импорт anthropic
from .prompts import build_prompt, SYSTEM_PROMPT
from apps.presentations.models import Presentation
from apps.billing.utils import check_usage_limit, increment_usage


def parse_claude_json(raw: str) -> dict:
    """Парсим JSON из ответа Claude — с защитой от лишнего текста вокруг."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{[\s\S]*\}', raw)
        if not match:
            raise ValueError('Claude вернул невалидный JSON')
        return json.loads(match.group())


class GeneratePresentationView(APIView):
    permission_classes = []  # анонимным разрешено

    def post(self, request):
        prompt       = request.data.get('prompt', '')
        theme        = request.data.get('theme', 'light')
        slides_count = int(request.data.get('slides_count', 8))

        if request.user.is_authenticated:
            if not check_usage_limit(request.user):
                return Response(
                    {'error': 'Лимит генераций исчерпан. Обновите план.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

        try:
            raw = call_claude(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=build_prompt(prompt, slides_count=slides_count)
            )
            presentation_data = parse_claude_json(raw)
        except (ValueError, Exception) as e:
            return Response({'error': 'Ошибка генерации, попробуйте ещё раз'}, status=500)

        presentation = Presentation.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_key=request.session.session_key,
            title=presentation_data.get('title', 'Без названия'),
            theme=theme,
            slides=presentation_data.get('slides', []),
        )

        if request.user.is_authenticated:
            increment_usage(request.user, action='generate')

        return Response({
            'id': str(presentation.id),
            'title': presentation.title,
            'slides': presentation.slides,
            'theme': presentation.theme,
        })


class RefineSlideView(APIView):
    """AI-допромптинг одного слайда"""

    SYSTEM = """Ты редактируешь ОДИН слайд презентации по инструкции пользователя.
Верни ТОЛЬКО JSON этого слайда в том же формате. Никакого текста вне JSON.
Сохраняй структуру (type, index). Меняй только содержимое."""

    def post(self, request):
        slide       = request.data.get('slide', {})
        instruction = request.data.get('instruction', '')
        pres_title  = request.data.get('presentation_title', '')

        if request.user.is_authenticated:
            if not check_usage_limit(request.user, action='refine'):
                return Response({'error': 'Лимит допромптинга исчерпан'}, status=429)

        user_prompt = f"""Презентация о: "{pres_title}"

Текущий слайд:
{json.dumps(slide, ensure_ascii=False, indent=2)}

Инструкция: "{instruction}"

Верни обновлённый слайд в том же JSON формате."""

        try:
            raw = call_claude(system_prompt=self.SYSTEM, user_prompt=user_prompt)
            refined = parse_claude_json(raw)
        except Exception:
            return Response({'error': 'Ошибка обработки'}, status=500)

        if request.user.is_authenticated:
            increment_usage(request.user, action='refine')

        return Response({'slide': refined})
```

### Экспорт (Django view + Celery)

```python
# apps/exports/views.py
from django.http import HttpResponse
from rest_framework.views import APIView
from .pptx_generator import generate_pptx
from .pdf_generator import generate_pdf
from apps.presentations.models import Presentation


class ExportPPTXView(APIView):
    def get(self, request, pk):
        presentation = Presentation.objects.get(id=pk)

        # Проверка доступа (платный план для PPTX без водяного знака)
        add_watermark = not (
            request.user.is_authenticated and
            hasattr(request.user, 'subscription') and
            request.user.subscription.plan in ('starter', 'pro')
        )

        pptx_bytes = generate_pptx(
            {'title': presentation.title,
             'theme': presentation.theme,
             'slides': presentation.slides},
            watermark=add_watermark
        )

        response = HttpResponse(
            pptx_bytes,
            content_type='application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )
        response['Content-Disposition'] = f'attachment; filename="{presentation.title}.pptx"'
        return response
```

### Lимиты по планам (utils)

```python
# apps/billing/utils.py
from django.utils import timezone
from datetime import timedelta

PLAN_LIMITS = {
    'free':    {'generate': 3,  'refine': 5},
    'student': {'generate': None, 'refine': None},  # лимит в слайдах, не в генерациях
    'pro':     {'generate': None, 'refine': None},  # None = безлимит
}

def check_usage_limit(user, action='generate') -> bool:
    plan = getattr(user, 'subscription', None)
    plan_name = plan.plan if plan else 'free'
    limit = PLAN_LIMITS[plan_name][action]

    if limit is None:
        return True  # безлимит

    since = timezone.now() - timedelta(days=30)
    count = user.usagelog_set.filter(action=action, created_at__gte=since).count()
    return count < limit


def increment_usage(user, action='generate'):
    from apps.presentations.models import UsageLog
    UsageLog.objects.create(user=user, action=action)
```

### Рендеринг через Reveal.js

```javascript
// components/PresentationViewer.tsx
import Reveal from 'reveal.js';

const THEMES = {
  dark: { bg: '#1a1a2e', text: '#eee', accent: '#6c63ff' },
  light: { bg: '#ffffff', text: '#333', accent: '#2563eb' },
  corporate: { bg: '#0f172a', text: '#f8fafc', accent: '#0ea5e9' },
  minimal: { bg: '#fafafa', text: '#111', accent: '#000' },
  vibrant: { bg: '#7c3aed', text: '#fff', accent: '#fbbf24' }
};

function renderSlide(slide, theme) {
  const colors = THEMES[theme];
  
  switch (slide.type) {
    case 'title':
      return `
        <section style="background:${colors.bg}">
          <h1 style="color:${colors.text}">${slide.title}</h1>
          <p style="color:${colors.accent}">${slide.subtitle}</p>
        </section>`;
    
    case 'content':
      return `
        <section style="background:${colors.bg}">
          <h2 style="color:${colors.text}">${slide.title}</h2>
          <ul>
            ${slide.bullets.map(b => 
              `<li style="color:${colors.text}">${b}</li>`
            ).join('')}
          </ul>
        </section>`;
    
    // другие типы...
  }
}
```

### Трюки для улучшения качества генерации

1. **Few-shot примеры** — добавьте 1-2 примера хороших слайдов в системный промпт
2. **Валидация JSON** — если Claude вернул невалидный JSON, повторите запрос (retry)
3. **Streaming** — используйте stream API чтобы показывать прогресс юзеру
4. **Температура** — используйте temperature: 0.7 для баланса креативности и точности
5. **Постобработка** — полноценный модуль с валидацией, санитизацией и тестами (см. раздел 5.5)

---

## 5.5 Постобработка и валидация ответа Claude

Это отдельный слой между `call_claude()` и сохранением в БД. Задача — привести сырой ответ модели к предсказуемому формату независимо от того, что именно она вернула.

Весь модуль живёт в `apps/generation/postprocessing.py`.

```python
# apps/generation/postprocessing.py
"""
Постобработка и валидация JSON-ответа от Claude.

Принцип работы:
  1. parse_json()         — извлечь JSON из сырого текста (Claude иногда добавляет лишнее)
  2. validate_structure() — проверить что все обязательные поля присутствуют
  3. sanitize_slides()    — привести каждый слайд к допустимому виду
  4. postprocess()        — точка входа, вызывает всё выше по порядку

Каждая функция принимает данные и возвращает исправленные данные или
бросает ValueError с понятным сообщением — views обрабатывают его и
возвращают пользователю "Попробуйте ещё раз".
"""

import re
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Константы
# ──────────────────────────────────────────────

# Максимальная длина заголовка слайда (символов)
MAX_TITLE_LENGTH = 80

# Максимальная длина одного буллета
MAX_BULLET_LENGTH = 120

# Максимальное количество буллетов на слайде
MAX_BULLETS = 5

# Минимальное количество слайдов в презентации
MIN_SLIDES = 2

# Допустимые типы слайдов
VALID_SLIDE_TYPES = {'title', 'content', 'two_column', 'quote', 'stats', 'cta'}


# ──────────────────────────────────────────────
# Шаг 1: Парсинг JSON из сырого текста
# ──────────────────────────────────────────────

def parse_json(raw: str) -> dict:
    """
    Извлекает JSON-объект из строки ответа Claude.

    Claude иногда оборачивает JSON в markdown-блок (```json ... ```)
    или добавляет вводный текст перед фигурной скобкой.
    Функция пробует три стратегии по очереди:
      1. Прямой json.loads — если ответ уже чистый JSON
      2. Удаление markdown-обёртки ```json ... ```
      3. Поиск первого {...} через регулярку

    Raises:
        ValueError: если ни одна стратегия не сработала
    """
    # Стратегия 1: чистый JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Стратегия 2: убрать markdown-блок
    cleaned = re.sub(r'```(?:json)?\s*', '', raw).replace('```', '').strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Стратегия 3: вырезать первый {...} блок
    match = re.search(r'\{[\s\S]*\}', raw)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.error("parse_json: не удалось извлечь JSON. raw[:200]=%s", raw[:200])
    raise ValueError("Claude вернул невалидный JSON. Попробуйте ещё раз.")


# ──────────────────────────────────────────────
# Шаг 2: Валидация структуры
# ──────────────────────────────────────────────

def validate_structure(data: dict) -> None:
    """
    Проверяет что презентация содержит обязательные поля верного типа.

    Не исправляет ошибки — только обнаруживает.
    Исправления делает sanitize_slides().

    Raises:
        ValueError: с описанием первой найденной проблемы
    """
    if not isinstance(data, dict):
        raise ValueError(f"Ожидался dict, получен {type(data).__name__}")

    if 'title' not in data:
        raise ValueError("Отсутствует поле 'title' в презентации")

    if 'slides' not in data:
        raise ValueError("Отсутствует поле 'slides' в презентации")

    if not isinstance(data['slides'], list):
        raise ValueError(f"'slides' должен быть списком, получен {type(data['slides']).__name__}")

    if len(data['slides']) < MIN_SLIDES:
        raise ValueError(
            f"Слишком мало слайдов: {len(data['slides'])}, минимум {MIN_SLIDES}"
        )

    for i, slide in enumerate(data['slides']):
        if not isinstance(slide, dict):
            raise ValueError(f"Слайд #{i} должен быть dict, получен {type(slide).__name__}")
        if 'type' not in slide:
            raise ValueError(f"Слайд #{i} не имеет поля 'type'")
        if slide['type'] not in VALID_SLIDE_TYPES:
            raise ValueError(
                f"Слайд #{i}: неизвестный тип '{slide['type']}'. "
                f"Допустимые: {VALID_SLIDE_TYPES}"
            )
        if 'title' not in slide:
            raise ValueError(f"Слайд #{i} (тип={slide['type']}) не имеет поля 'title'")


# ──────────────────────────────────────────────
# Шаг 3: Санитизация — исправление данных
# ──────────────────────────────────────────────

def _truncate(text: str, max_len: int, suffix: str = '…') -> str:
    """
    Обрезает строку до max_len символов, добавляя suffix если обрезка произошла.

    Args:
        text:    исходная строка
        max_len: максимальная длина результата включая suffix
        suffix:  символ-индикатор обрезки (по умолчанию многоточие)

    Returns:
        Строка длиной не более max_len символов.

    Example:
        >>> _truncate("Очень длинный заголовок слайда", max_len=20)
        'Очень длинный заголо…'
    """
    if len(text) <= max_len:
        return text
    return text[:max_len - len(suffix)] + suffix


def _sanitize_title(title: Any, slide_index: int) -> str:
    """
    Приводит заголовок слайда к допустимому виду.

    - Если title не строка — конвертируем через str()
    - Убираем лишние пробелы и переносы строк
    - Обрезаем до MAX_TITLE_LENGTH
    """
    if not isinstance(title, str):
        logger.warning("Слайд #%d: title не строка (%s), конвертируем", slide_index, type(title))
        title = str(title)

    title = ' '.join(title.split())  # схлопываем пробелы и переносы

    if len(title) > MAX_TITLE_LENGTH:
        logger.info("Слайд #%d: title обрезан с %d до %d символов", slide_index, len(title), MAX_TITLE_LENGTH)
        title = _truncate(title, MAX_TITLE_LENGTH)

    return title


def _sanitize_bullets(bullets: Any, slide_index: int) -> list[str]:
    """
    Приводит список буллетов к допустимому виду.

    - Если bullets не список — возвращаем пустой список (лучше пусто, чем ошибка)
    - Пропускаем пустые строки и нестроковые элементы
    - Обрезаем каждый буллет до MAX_BULLET_LENGTH
    - Ограничиваем количество буллетов до MAX_BULLETS

    Args:
        bullets:     сырой список буллетов из ответа Claude
        slide_index: номер слайда для логирования

    Returns:
        Список строк, каждая не длиннее MAX_BULLET_LENGTH.
    """
    if not isinstance(bullets, list):
        logger.warning("Слайд #%d: bullets не список (%s), возвращаем []", slide_index, type(bullets))
        return []

    result = []
    for i, bullet in enumerate(bullets):
        # Пропускаем нестроковые и пустые
        if not isinstance(bullet, str):
            logger.warning("Слайд #%d, буллет #%d: не строка (%s), пропускаем", slide_index, i, type(bullet))
            continue

        bullet = ' '.join(bullet.split())  # убираем лишние пробелы
        if not bullet:
            continue

        if len(bullet) > MAX_BULLET_LENGTH:
            logger.info(
                "Слайд #%d, буллет #%d: обрезан с %d до %d символов",
                slide_index, i, len(bullet), MAX_BULLET_LENGTH
            )
            bullet = _truncate(bullet, MAX_BULLET_LENGTH)

        result.append(bullet)

        # Не берём больше MAX_BULLETS
        if len(result) >= MAX_BULLETS:
            if i < len(bullets) - 1:
                logger.info("Слайд #%d: буллеты обрезаны до %d штук", slide_index, MAX_BULLETS)
            break

    return result


def _sanitize_slide(slide: dict, index: int) -> dict:
    """
    Приводит один слайд к допустимому виду.

    Гарантирует наличие поля 'index', чистит title и bullets,
    сохраняет все остальные поля нетронутыми.

    Args:
        slide: словарь слайда из ответа Claude
        index: порядковый номер (0-based) для проставления поля index

    Returns:
        Исправленный словарь слайда.
    """
    sanitized = dict(slide)  # не мутируем оригинал

    # Всегда проставляем index — Claude иногда путает нумерацию
    sanitized['index'] = index

    # Чистим title
    sanitized['title'] = _sanitize_title(slide.get('title', ''), index)

    # Чистим bullets (только для слайдов где они есть)
    if 'bullets' in slide:
        sanitized['bullets'] = _sanitize_bullets(slide['bullets'], index)

    # Чистим subtitle (для title-слайдов)
    if 'subtitle' in slide and isinstance(slide['subtitle'], str):
        sanitized['subtitle'] = _truncate(
            ' '.join(slide['subtitle'].split()),
            MAX_TITLE_LENGTH
        )

    return sanitized


def sanitize_slides(data: dict) -> dict:
    """
    Применяет санитизацию ко всем слайдам презентации.

    Также чистит title самой презентации.

    Args:
        data: валидированный словарь презентации

    Returns:
        Новый словарь с исправленными данными (оригинал не мутируется).
    """
    result = dict(data)

    # Чистим title презентации
    result['title'] = _truncate(
        ' '.join(str(data.get('title', 'Презентация')).split()),
        MAX_TITLE_LENGTH
    )

    # Чистим каждый слайд
    result['slides'] = [
        _sanitize_slide(slide, i)
        for i, slide in enumerate(data['slides'])
    ]

    return result


# ──────────────────────────────────────────────
# Точка входа
# ──────────────────────────────────────────────

def postprocess(raw: str) -> dict:
    """
    Главная функция постобработки. Вызывается из views после call_claude().

    Последовательно применяет:
      1. parse_json()         — извлечь JSON из текста
      2. validate_structure() — проверить структуру
      3. sanitize_slides()    — исправить данные

    Args:
        raw: сырая строка ответа от Claude

    Returns:
        Готовый словарь презентации — чистый, валидный, с обрезанными строками.

    Raises:
        ValueError: если JSON невалиден или структура не восстановима.
                    Views ловят это и возвращают пользователю 500.

    Usage:
        raw = call_claude(system_prompt, user_prompt)
        presentation = postprocess(raw)
        # presentation готов к сохранению в БД
    """
    # Шаг 1: парсим JSON
    data = parse_json(raw)

    # Шаг 2: валидируем структуру (бросает ValueError при проблеме)
    validate_structure(data)

    # Шаг 3: санитизируем данные
    result = sanitize_slides(data)

    logger.info(
        "postprocess: OK — '%s', %d слайдов",
        result.get('title', '?'),
        len(result.get('slides', []))
    )

    return result
```

### Использование в views

```python
# apps/generation/views.py
from .claude_client import call_claude
from .postprocessing import postprocess
from .prompts import build_prompt, SYSTEM_PROMPT

class GeneratePresentationView(APIView):
    permission_classes = []

    def post(self, request):
        prompt       = request.data.get('prompt', '')
        theme        = request.data.get('theme', 'light')
        slides_count = int(request.data.get('slides_count', 8))

        # Проверка лимитов
        if request.user.is_authenticated:
            result = check_and_spend_slides(request.user, 'generate', slides_count)
            if not result['allowed']:
                return Response({
                    'error': 'slide_limit',
                    'show_upsell': True,
                    'available': result['available'],
                }, status=429)

        # Вызов Claude + постобработка
        try:
            raw = call_claude(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=build_prompt(prompt, slides_count=slides_count)
            )
            presentation_data = postprocess(raw)   # ← вся логика здесь

        except ValueError as e:
            # Невалидный JSON или структура — просим попробовать ещё раз
            logger.warning("GeneratePresentationView: postprocess error: %s", e)
            return Response({'error': str(e)}, status=422)

        except Exception as e:
            logger.error("GeneratePresentationView: unexpected error: %s", e)
            return Response({'error': 'Ошибка генерации, попробуйте ещё раз'}, status=500)

        # Сохраняем в БД
        presentation = Presentation.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_key=request.session.session_key,
            title=presentation_data['title'],
            theme=theme,
            slides=presentation_data['slides'],
        )

        return Response({
            'id': str(presentation.id),
            'title': presentation.title,
            'slides': presentation.slides,
            'theme': presentation.theme,
        })
```

### Тесты постобработки

```python
# tests/test_postprocessing.py
"""
Тесты для apps/generation/postprocessing.py
Запуск: python manage.py test apps.generation.tests.test_postprocessing
"""
import pytest
from apps.generation.postprocessing import (
    parse_json, validate_structure, sanitize_slides, postprocess,
    MAX_TITLE_LENGTH, MAX_BULLET_LENGTH, MAX_BULLETS,
)


class TestParseJson:
    """parse_json: извлечение JSON из разных форматов ответа Claude"""

    def test_clean_json(self):
        """Чистый JSON парсится напрямую"""
        raw = '{"title": "Тест", "slides": []}'
        assert parse_json(raw)['title'] == 'Тест'

    def test_json_with_markdown_block(self):
        """JSON в markdown-блоке ```json ... ``` извлекается корректно"""
        raw = '```json\n{"title": "Тест", "slides": []}\n```'
        assert parse_json(raw)['title'] == 'Тест'

    def test_json_with_preamble(self):
        """JSON после вводного текста Claude извлекается через regex"""
        raw = 'Вот ваша презентация:\n{"title": "Тест", "slides": []}'
        assert parse_json(raw)['title'] == 'Тест'

    def test_invalid_json_raises(self):
        """Совсем невалидный текст бросает ValueError"""
        with pytest.raises(ValueError, match='невалидный JSON'):
            parse_json('это не JSON вообще')


class TestValidateStructure:
    """validate_structure: проверка обязательных полей"""

    def _valid(self):
        return {
            'title': 'Тест',
            'slides': [
                {'index': 0, 'type': 'title', 'title': 'Заголовок'},
                {'index': 1, 'type': 'content', 'title': 'Контент', 'bullets': []},
            ]
        }

    def test_valid_passes(self):
        """Валидная структура не бросает исключений"""
        validate_structure(self._valid())  # не должно бросить

    def test_missing_title_raises(self):
        data = self._valid()
        del data['title']
        with pytest.raises(ValueError, match="'title'"):
            validate_structure(data)

    def test_missing_slides_raises(self):
        data = self._valid()
        del data['slides']
        with pytest.raises(ValueError, match="'slides'"):
            validate_structure(data)

    def test_unknown_slide_type_raises(self):
        data = self._valid()
        data['slides'][0]['type'] = 'unknown_type'
        with pytest.raises(ValueError, match='unknown_type'):
            validate_structure(data)

    def test_too_few_slides_raises(self):
        data = self._valid()
        data['slides'] = data['slides'][:1]
        with pytest.raises(ValueError, match='мало слайдов'):
            validate_structure(data)


class TestSanitizeSlides:
    """sanitize_slides: исправление данных"""

    def _make(self, **kwargs):
        base = {
            'title': 'Презентация',
            'slides': [
                {'index': 0, 'type': 'title', 'title': 'Заголовок', 'subtitle': 'Sub'},
                {'index': 1, 'type': 'content', 'title': 'Контент', 'bullets': ['Буллет']},
            ]
        }
        base.update(kwargs)
        return base

    def test_long_title_is_truncated(self):
        """Заголовок длиннее MAX_TITLE_LENGTH обрезается"""
        long_title = 'А' * (MAX_TITLE_LENGTH + 50)
        data = self._make()
        data['slides'][0]['title'] = long_title
        result = sanitize_slides(data)
        assert len(result['slides'][0]['title']) <= MAX_TITLE_LENGTH

    def test_long_bullet_is_truncated(self):
        """Длинный буллет обрезается до MAX_BULLET_LENGTH"""
        long_bullet = 'Б' * (MAX_BULLET_LENGTH + 50)
        data = self._make()
        data['slides'][1]['bullets'] = [long_bullet]
        result = sanitize_slides(data)
        assert len(result['slides'][1]['bullets'][0]) <= MAX_BULLET_LENGTH

    def test_excess_bullets_are_dropped(self):
        """Буллеты сверх MAX_BULLETS отбрасываются"""
        data = self._make()
        data['slides'][1]['bullets'] = [f'Буллет {i}' for i in range(MAX_BULLETS + 3)]
        result = sanitize_slides(data)
        assert len(result['slides'][1]['bullets']) == MAX_BULLETS

    def test_non_string_bullet_is_skipped(self):
        """Нестроковые буллеты пропускаются без исключения"""
        data = self._make()
        data['slides'][1]['bullets'] = [42, None, 'Нормальный буллет']
        result = sanitize_slides(data)
        assert result['slides'][1]['bullets'] == ['Нормальный буллет']

    def test_indexes_are_reassigned(self):
        """Индексы слайдов всегда проставляются по порядку"""
        data = self._make()
        data['slides'][0]['index'] = 99  # Claude перепутал
        result = sanitize_slides(data)
        assert result['slides'][0]['index'] == 0
        assert result['slides'][1]['index'] == 1

    def test_original_data_not_mutated(self):
        """Функция не изменяет входной словарь"""
        data = self._make()
        original_title = data['slides'][0]['title']
        sanitize_slides(data)
        assert data['slides'][0]['title'] == original_title
```



---

## 6. Маркетинг и продвижение

### Рынок: только РФ/СНГ на старте

Все усилия — на русскоязычную аудиторию. Это даёт фокус: один язык, понятные каналы, рублёвые цены, локальная боль ("Gamma не работает нормально с кириллицей").

---

### Шаг 1: Стратегический штурм сегментов ЦА

Прежде чем выбирать каналы — нужно понять, кто реально будет платить. Вот полный разбор потенциальных сегментов для РФ/СНГ.

#### Карта сегментов

| Сегмент | Боль | Частота потребности | Готовность платить | Доступность |
|---|---|---|---|---|
| **Консультанты / фрилансеры** | КП, отчёты клиентам — каждую неделю | Очень высокая | Высокая (время = деньги) | Средняя |
| **Менеджеры среднего звена** | Еженедельные отчёты, презентации боссу | Очень высокая | Средняя (платит компания) | Высокая |
| **Стартапы / фаундеры** | Питч-дек для инвесторов, партнёров | Высокая | Высокая | Средняя (тусовка компактная) |
| **Маркетологи** | Стратегии, брифы, отчёты по кампаниям | Высокая | Средняя | Высокая |
| **Преподаватели / эксперты** | Лекции, курсы, вебинары | Средняя | Низкая-средняя | Высокая |
| **Студенты** | Курсовые, дипломы, конкурсы | Средняя (сессии) | Низкая | Очень высокая |
| **HR и рекрутеры** | Onboarding, обучающие презентации | Средняя | Средняя | Средняя |

#### Приоритизация сегментов

Критерии выбора первого сегмента: высокая боль, сам принимает решение о покупке, достижим через конкретный канал, даёт быстрый фидбек.

**Приоритет 1 — Консультанты и фрилансеры**

Лучший стартовый сегмент. Работают на себя — решение о покупке мгновенное, без согласований. Время для них буквально деньги. Делают презентации регулярно: КП, отчёты, онбординг клиентов. Активны в Telegram и на vc.ru.

Портрет: маркетолог-фрилансер, бизнес-консультант, финансовый аналитик на аутсорсе. 28-42 года, доход выше среднего, ценят скорость.

**Приоритет 2 — Менеджеры в компаниях**

Огромный сегмент, но цикл продажи длиннее — сотрудник сам находит, пробует и убеждает купить. Хорошо работает word-of-mouth внутри компаний: один попробовал → рассказал команде.

Портрет: тимлид, проджект-менеджер, product owner, руководитель отдела. Делает презентации раз в 1-2 недели.

**Приоритет 3 — Стартапы и фаундеры**

Высокая боль, но маленький сегмент в РФ. Зато очень активны в соцсетях и быстро шарят инструменты — хороши для word-of-mouth и PR, но не для масштаба.

**Отложить:** студенты (низкий LTV), HR (специфичный контент), преподаватели (длинный цикл принятия решений).

---

### Шаг 2: Предсказуемый платный канал

При бюджете $100-500/мес в РФ работают два канала: **Яндекс Директ** (поиск) и **ВКонтакте** (таргет). Директ — приоритет, потому что человек сам ищет решение.

#### Яндекс Директ — поисковая реклама

Самый предсказуемый канал: человек ищет решение, вы показываете объявление. Высокая конверсия при правильных ключах.

**Ключевые запросы для тестирования:**

```
Горячие (транзакционные — основной бюджет):
  "создать презентацию онлайн"         ~3,200 показов/мес
  "генератор презентаций"              ~1,800 показов/мес
  "сделать презентацию быстро"         ~2,100 показов/мес
  "ai для презентаций"                 ~900 показов/мес
  "альтернатива powerpoint онлайн"     ~600 показов/мес

Тёплые (информационные — дешевле, меньший приоритет):
  "как сделать презентацию"            ~8,000 показов/мес
  "шаблоны для презентаций"            ~4,500 показов/мес
  "питч дек пример"                    ~700 показов/мес
```

**Структура кампании:**

```
Кампания 1: Горячие запросы (60% бюджета)
  Группа: "генератор презентаций"
  Группа: "создать презентацию онлайн"
  Ставка: 40-80 руб/клик
  Цель:   регистрация

Кампания 2: Тёплые запросы (30% бюджета)
  Группа: "как сделать презентацию"
  Ставка: 15-30 руб/клик
  Цель:   посещение лендинга + ретаргет

Кампания 3: Ретаргетинг (10% бюджета)
  Аудитория: были на сайте >30 сек, не зарегистрировались
  Оффер:     "Вернитесь — ваша первая презентация бесплатно"
```

**Расчёт на тест (бюджет 150 руб/день = ~4,500 руб/мес):**

```
~4,500 руб / 50 руб CPC = ~90 кликов/мес
При конверсии лендинга 20% = ~18 регистраций
При конверсии в платных 8% = ~1-2 платящих

CAC = 4,500 руб / 1.5 = ~3,000 руб (первый месяц, дорого)
```

Первый месяц дорогой — это нормально. Главное: получить данные. После оптимизации объявлений и посадочной страницы CAC снижается в 2-3 раза.

**Цель:** CAC < 1,500 руб к третьему месяцу.

#### ВКонтакте — таргетированная реклама

Хуже по конверсии чем поиск (человек не ищет активно), но позволяет точно попасть в аудиторию по интересам.

**Аудитории для теста:**

```
Аудитория 1: Интерес "Бизнес и стартапы" + возраст 25-40
Аудитория 2: Подписчики сообществ vc.ru, Rusbase, Tinkoff Business
Аудитория 3: Look-alike от пикселя сайта (нужно 300+ посетителей сначала)
```

**Форматы:** видео-демо 30 сек "из текста в презентацию за 30 секунд" или карусель "до промпта / после".

Бюджет на тест: $100/мес. Если CPL > 500 руб — останавливаем.

---

### Шаг 3: Бесплатные каналы — органика

#### Telegram — главный бесплатный канал для РФ

**Тактика 1: Посевы в тематических каналах**

Договариваться о публикации (часто бесплатно за доступ к Pro или за бартер):

```
Стартапы и бизнес:
  @startupoftheday, @rusbase, @vc_ru, @tceh

AI и технологии:
  @AIofTheDay, @neural_network_ru, @ai_machina

Фрилансеры и маркетологи:
  @freelance_ru, @marketingru
```

Не рекламный пост — а кейс: "как X сделал питч-дек за 2 минуты с AI". Редакторы охотнее берут полезный контент.

**Тактика 2: Свой Telegram-канал**

Называть не "[Название продукта]", а по теме: "AI-инструменты для бизнеса". Люди подписываются на пользу.

Контент-план (3-4 поста в неделю): кейсы, подборки структур для питч-деков, behind-the-scenes разработки, раз в 2 недели — прямой призыв попробовать.

**Тактика 3: Активность в чатах**

Отвечать на вопросы про презентации в чатах акселераторов, конференций, нишевых сообществ — упоминать инструмент только к месту.

#### vc.ru и Habr — контент-маркетинг

Статьи попадают в Яндекс и живут годами. Темы которые хорошо работают на vc.ru:

- "Я сделал AI-сервис за 6 недель — вот что получилось" (личная история)
- "Почему Gamma не подходит для русского бизнеса и что делать"
- "Честный разбор 5 AI-инструментов для презентаций"

На Habr — техническая аудитория, но читают и продуктовые люди:

- "Как мы строили AI-генератор презентаций на Django + Claude"
- "Claude vs GPT-4 для генерации структурированного контента"

---

### Шаг 4: Воронки по сегментам

#### Воронка А: Консультанты и фрилансеры (основная)

```
Источник: Яндекс Директ (горячие запросы) + Telegram-посевы
    |
    v
Лендинг: "Презентация за 30 секунд — попробуй прямо сейчас"
  Промпт-поле прямо на главной, без регистрации
    |
    v
AHA-момент: пользователь видит свою готовую презентацию
    |
    v
Триггер регистрации: нажал "Скачать PPTX" -> модальное окно
  Email + пароль (или Google) -> презентация привязывается к аккаунту
    |
    v
Welcome email: "Вот ваша презентация + 2 оставшиеся генерации"
    |
    v
День 3 — email: "Как консультанты делают КП за 2 минуты" (кейс)
    |
    v
Лимит исчерпан -> email: "Вы использовали 3/3. Стартер за 490 руб/мес"
    |
    v
Апгрейд -> платящий пользователь
```

**Целевые метрики воронки А:**

| Этап | Цель | Инструмент |
|---|---|---|
| Клик -> лендинг | CTR 3-5% в Директе | Яндекс Метрика |
| Лендинг -> генерация | 40% | Событие в Метрике |
| Генерация -> регистрация | 25% | Django UsageLog |
| Регистрация -> 2-я генерация | 50% | Retention D3 |
| Лимит -> апгрейд | 8-12% | ЮKassa / LemonSqueezy |

#### Воронка Б: Менеджеры в компаниях

```
Источник: ВКонтакте таргет + SEO (статьи на vc.ru)
    |
    v
Лендинг: "Отчёт руководителю за 5 минут, не за 2 часа"
    |
    v
Демо -> регистрация (тот же флоу)
    |
    v
Активация: первая рабочая презентация сделана
    |
    v
Виральность: пользователь шарит коллегам
  -> Word-of-mouth внутри компании -> новые пользователи
    |
    v
Апгрейд или Team-план
```

Ключевое отличие: один активный пользователь в компании может привести 3-5 коллег. Отслеживать через utm_source=share.

#### Воронка В: Виральная (водяной знак)

```
Пользователь Free -> шарит презентацию по ссылке
    |
    v
Зритель видит водяной знак "Сделано с [Название]"
  Клик -> лендинг
    |
    v
"Такую же презентацию — бесплатно за 30 секунд"
  Демо -> регистрация -> платящий
```

Бесплатная воронка, работает 24/7. Задача: сделать водяной знак кликабельным и красивым, не стыдным.

---

### Шаг 5: Гипотезы для тестирования

Каждую гипотезу тестируем 2-4 недели, фиксируем результат, принимаем решение.

#### Гипотезы по каналам

| # | Гипотеза | Метрика успеха | Бюджет | Срок |
|---|---|---|---|---|
| H1 | Директ (горячие запросы) даёт CAC < 1,500 руб | CAC | 6,000 руб | 2 нед |
| H2 | Посев в Telegram-каналах про AI даёт 50+ регистраций | Регистрации | 0 руб | 1 нед |
| H3 | Статья на vc.ru "личная история" даёт 200+ переходов | Переходы | 0 руб | 1 нед |
| H4 | ВКонтакте таргет (бизнес) даёт CPL < 300 руб | CPL | 4,000 руб | 2 нед |
| H5 | Welcome-серия из 3 писем поднимает конверсию в платных на 30% | Апгрейды | 0 руб | 4 нед |

#### Гипотезы по лендингу (A/B)

| # | Вариант А | Вариант Б | Метрика |
|---|---|---|---|
| L1 | "Презентация за 30 секунд" | "Замените PowerPoint на AI" | Конверсия в генерацию |
| L2 | CTA "Попробовать бесплатно" | "Создать презентацию" | CTR кнопки |
| L3 | Промпт-поле сразу на главной | Видео-демо + кнопка ниже | Конверсия в генерацию |

#### Гипотезы по активации

| # | Гипотеза | Метрика |
|---|---|---|
| A1 | Онбординг с готовым промптом-примером увеличивает AHA-момент | D1 retention |
| A2 | Email через 1 час после регистрации с напоминанием о генерации | D1 retention |
| A3 | Показ счётчика "осталось X/3 генераций" повышает апгрейд | Conversion to paid |

---

### Шаг 6: Метрики и дашборд

#### Ключевые метрики (смотреть еженедельно)

```
Acquisition:
  Новых регистраций / неделю      цель: 50 к месяцу 2
  CAC по каналу                   цель: < 1,500 руб

Activation:
  % сделавших 1-ю генерацию       цель: > 60%
  Время до первой генерации        цель: < 2 минут

Retention:
  D1 retention                    цель: > 40%
  D7 retention                    цель: > 20%

Revenue:
  Новые платящие / неделю         цель: 5 к месяцу 3
  MRR                             цель: 15,000 руб к месяцу 3
  Churn rate                      цель: < 10%/мес
```

#### Инструменты (бесплатно)

```
Яндекс Метрика   — трафик, конверсии, вебвизор
PostHog          — product analytics, воронки, retention (бесплатно до 1M событий)
Django Admin     — UsageLog, подписки — базовые данные уже в БД
```

**Telegram-бот для ежедневного отчёта:**

```python
# management/commands/daily_report.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
import requests

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        yesterday = timezone.now() - timedelta(days=1)

        new_users  = User.objects.filter(date_joined__gte=yesterday).count()
        generates  = UsageLog.objects.filter(
                         action='generate', created_at__gte=yesterday).count()
        new_paid   = Subscription.objects.filter(
                         plan__in=['starter', 'pro'],
                         created_at__gte=yesterday).count()

        text = (
            f"Отчёт за вчера:\n"
            f"Новых пользователей: {new_users}\n"
            f"Генераций: {generates}\n"
            f"Новых платящих: {new_paid}"
        )

        requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": ADMIN_CHAT_ID, "text": text}
        )
```

Запускается через cron раз в день — всегда в курсе что происходит.

---

### Распределение бюджета $300/мес

```
Яндекс Директ (горячие запросы):    150 руб/день = ~4,500 руб/мес  ($50)
ВКонтакте таргет (тест):             3,000 руб/мес                  ($33)
Telegram-посевы (1-2 канала):        5,000-9,000 руб/мес            ($55-100)
Резерв для масштабирования:          остаток
```

---

### Принцип: один канал за раз

```
Месяц 1: Только Яндекс Директ (горячие) + органика Telegram
          Узнаём реальный CAC и конверсию лендинга

Месяц 2: Масштабируем рабочее + добавляем ВКонтакте
          Сравниваем CAC по каналам

Месяц 3: Отключаем дорогой канал, удваиваем бюджет дешёвого
          Выходим на предсказуемый CAC < 1,500 руб
```

Распыляться на все каналы сразу = слить бюджет и не понять что работает.


---

## 7. Монетизация

### Модель: слайдо-кредитная подписка + разовые докупки

Лимит считается в **слайдах**, а не в презентациях. Это ключевое решение:
- Пользователь не думает о "кредитах" — он видит понятный счётчик слайдов
- Один допромптинг слайда = 1 слайд из лимита (AI-действие тоже стоит)
- Пользователь, который делает 3 презентации по 10 слайдов, исчерпает лимит так же как тот, кто делает 6 презентаций по 5 слайдов

Пользователю лимит виден как "слайды". Внутри — токены Claude. Во вкладке Usage личного кабинета — детализация.

---

### Структура тарифов

#### Free
- **30 слайдов в месяц** (~3-4 презентации по 8 слайдов)
- **1 экспорт в PDF в месяц**, остальное — HTML (просмотр в браузере)
- PPTX — только по подписке
- Водяной знак на всех экспортах
- До 8 слайдов в одной презентации
- 2 базовые темы оформления
- Допромптинг слайда: тратит слайды из того же пула

При попытке скачать PDF повторно или скачать PPTX — модальное окно:
> "Вы уже использовали 1 PDF в этом месяце. Безлимитный экспорт — в плане Student от 490 ₽/мес. **Или докупить 5 экспортов за 99 ₽.**"

*Цель Free: дать почувствовать продукт, создать виральность через водяной знак, конвертировать через ограничение экспорта*

#### Student — 490 ₽/мес (или 4 469 ₽/год при оплате за год)
- **150 слайдов в месяц** (~15-18 презентаций)
- Безлимитный экспорт PDF + PPTX
- Без водяного знака
- До 15 слайдов в одной презентации
- Все 5 тем оформления
- Вкладка Usage в личном кабинете
- Докупка слайдов: +50 слайдов за 99 ₽

*Для студентов, фрилансеров, редкого использования*

#### Pro — 1390 ₽/мес (или 12 677 ₽/год при оплате за год)
- **Безлимит слайдов**
- Безлимитный экспорт PDF + PPTX
- Без водяного знака
- До 20 слайдов в одной презентации
- Все темы + кастомные цвета и логотип
- Публичные ссылки для шаринга
- История всех презентаций
- Приоритетная генерация (меньше очередь)
- Полная вкладка Usage с аналитикой

*Для консультантов, менеджеров, предпринимателей — кто делает презентации регулярно*

#### Team — 3500 ₽/мес за команду до 5 человек
- Всё из Pro
- Общие шаблоны команды
- Единый брендинг для всех участников
- Управление пользователями

*Добавить позже, после валидации Pro*

---

### Докупка слайдов (Slide Packs)

Ключевая механика для конверсии без апгрейда подписки. Когда пользователь исчерпал лимит — предлагаем два пути:

```
Вы использовали 30/30 слайдов в этом месяце.

[Докупить 50 слайдов за 99 ₽]   ← быстро, без обязательств
[Перейти на Student за 490 ₽/мес] ← выгоднее при регулярном использовании

Следующий месяц начнётся через 12 дней.
```

**Пакеты докупки:**

| Пакет | Цена (РФ) | Цена (зарубеж) | Срок действия |
|---|---|---|---|
| 50 слайдов | 99 ₽ | $1.50 | 30 дней |
| 150 слайдов | 249 ₽ | $3.50 | 30 дней |
| 500 слайдов | 690 ₽ | $9 | 60 дней |

Пакеты — разовые платежи, не подписка. В ЮKassa и LemonSqueezy реализуются как one-time purchase.

**Почему это работает:**
- Низкий порог входа: 99 ₽ это не обязательство
- Пользователь, купивший пакет дважды, конвертируется в подписку сам — он уже считает деньги
- Дополнительный revenue без роста базы платящих подписчиков

---

### Вкладка Usage в личном кабинете

Пользователь не видит "токены" — видит слайды. Но детализация помогает понять ценность и стимулирует апгрейд.

```
/dashboard/usage

Текущий период: 1-31 мая

Слайды использовано:    [========--] 24 / 30
PDF экспортов:          1 / 1  (лимит исчерпан)
PPTX экспортов:         — (недоступно на Free)

История:
  15 мая  Презентация "Питч для инвесторов"    10 слайдов
  18 мая  Допромптинг × 4                       4 слайда
  21 мая  Презентация "Квартальный отчёт"       8 слайдов
  23 мая  Допромптинг × 2                       2 слайда
  Итого:                                        24 слайда

[Докупить слайды]   [Перейти на Student]
```

**Django модель для Usage:**

```python
# apps/billing/models.py

class SlideCredit(models.Model):
    """Пул слайдов пользователя — подписка + докупки"""
    user            = models.OneToOneField(User, on_delete=models.CASCADE)
    monthly_limit   = models.IntegerField(default=30)   # из плана
    extra_slides    = models.IntegerField(default=0)    # из докупок
    used_this_month = models.IntegerField(default=0)
    period_start    = models.DateField(auto_now_add=True)

    @property
    def available(self):
        plan = getattr(self.user, 'subscription', None)
        if plan and plan.plan == 'pro':
            return float('inf')  # безлимит
        return max(0, self.monthly_limit + self.extra_slides - self.used_this_month)

    @property
    def is_exhausted(self):
        return self.available == 0


class UsageLog(models.Model):
    """Детализация каждого действия"""
    ACTION_CHOICES = [
        ('generate', 'Генерация презентации'),
        ('refine',   'Допромптинг слайда'),
        ('export_pdf', 'Экспорт PDF'),
    ]
    user            = models.ForeignKey(User, on_delete=models.CASCADE)
    action          = models.CharField(max_length=20, choices=ACTION_CHOICES)
    slides_spent    = models.IntegerField(default=0)
    presentation    = models.ForeignKey('presentations.Presentation',
                                        null=True, on_delete=models.SET_NULL)
    created_at      = models.DateTimeField(auto_now_add=True)


class SlidePack(models.Model):
    """Разовая докупка слайдов"""
    PACKS = [
        ('pack_50',  50,  99,   1.50),
        ('pack_150', 150, 249,  3.50),
        ('pack_500', 500, 690,  9.00),
    ]
    user        = models.ForeignKey(User, on_delete=models.CASCADE)
    slides      = models.IntegerField()
    price_rub   = models.IntegerField()
    price_usd   = models.DecimalField(max_digits=6, decimal_places=2)
    expires_at  = models.DateTimeField()
    paid_at     = models.DateTimeField(auto_now_add=True)
```

**Логика списания слайдов:**

```python
# apps/billing/utils.py

SLIDES_PER_ACTION = {
    'generate': None,   # считается по количеству слайдов в презентации
    'refine':   1,      # один допромптинг = 1 слайд
    'export_pdf': 0,    # не тратит слайды, но проверяет лимит PDF
}

PLAN_LIMITS = {
    'free':    {'monthly_slides': 30,  'pdf_exports': 1},
    'student': {'monthly_slides': 150, 'pdf_exports': None},  # None = безлимит
    'pro':     {'monthly_slides': None,'pdf_exports': None},
}

def check_and_spend_slides(user, action: str, slides_count: int = 1) -> dict:
    """
    Проверяет лимит и списывает слайды.
    Возвращает {'allowed': bool, 'reason': str, 'available': int}
    """
    credit = SlideCredit.objects.get_or_create(user=user)[0]

    if credit.is_exhausted:
        return {
            'allowed': False,
            'reason': 'slides_exhausted',
            'available': 0,
            'show_upsell': True,   # показать модалку апгрейда/докупки
        }

    # Списываем
    credit.used_this_month += slides_count
    credit.save(update_fields=['used_this_month'])

    UsageLog.objects.create(
        user=user,
        action=action,
        slides_spent=slides_count,
    )

    return {'allowed': True, 'available': credit.available}


def check_pdf_export(user) -> dict:
    """Отдельная проверка лимита PDF для Free-плана"""
    plan = getattr(user, 'subscription', None)
    plan_name = plan.plan if plan else 'free'
    pdf_limit = PLAN_LIMITS[plan_name]['pdf_exports']

    if pdf_limit is None:
        return {'allowed': True}

    since = timezone.now().replace(day=1, hour=0, minute=0, second=0)
    used = UsageLog.objects.filter(
        user=user, action='export_pdf', created_at__gte=since
    ).count()

    if used >= pdf_limit:
        return {
            'allowed': False,
            'reason': 'pdf_limit_reached',
            'show_upsell': True,
            'upsell_message': (
                'Вы уже использовали 1 PDF в этом месяце. '
                'Безлимитный экспорт — в плане Student от 490 руб/мес. '
                'Или докупить 5 экспортов за 99 руб.'
            )
        }

    UsageLog.objects.create(user=user, action='export_pdf', slides_spent=0)
    return {'allowed': True}
```

**View для докупки пакета (ЮKassa):**

```python
class BuySlidePackView(APIView):
    def post(self, request):
        pack_id = request.data.get('pack')  # 'pack_50' | 'pack_150' | 'pack_500'

        PACK_CONFIG = {
            'pack_50':  {'slides': 50,  'amount': '99.00',  'days': 30},
            'pack_150': {'slides': 150, 'amount': '249.00', 'days': 30},
            'pack_500': {'slides': 500, 'amount': '690.00', 'days': 60},
        }
        pack = PACK_CONFIG.get(pack_id)
        if not pack:
            return Response({'error': 'Неверный пакет'}, status=400)

        payment = Payment.create({
            'amount': {'value': pack['amount'], 'currency': 'RUB'},
            'confirmation': {
                'type': 'redirect',
                'return_url': f'{settings.FRONTEND_URL}/dashboard/usage?pack_purchased=true',
            },
            'capture': True,
            'description': f'Докупка {pack["slides"]} слайдов',
            'metadata': {
                'user_id': str(request.user.id),
                'action': 'slide_pack',
                'pack_id': pack_id,
                'slides': pack['slides'],
                'days': pack['days'],
            },
        }, uuid.uuid4())

        return Response({'confirmation_url': payment.confirmation.confirmation_url})
```

В webhook при `payment.succeeded` и `action == 'slide_pack'` — просто добавляем слайды в `SlideCredit.extra_slides`.

---

### Почему такие цены?

Gamma берёт $18/мес (~1650 ₽) за Pro. Student за 490 ₽ и Pro за 1390 ₽ — это агрессивно дешевле для русскоязычного рынка, где средний чек SaaS ниже. При этом маржа остаётся высокой за счёт низкой стоимости API на слайд.

Ключевой инсайт от Gamma: конкурент Tome провалился потому что был слишком бесплатным. **Монетизируйте рано — через ограничение экспорта, а не генерации.**

---

### Экономика юнита (Unit Economics)

**Стоимость одного слайда для вас:**

```
Claude Sonnet 4.5 (на 1 слайд):
  Input:  ~200 токенов × $3/1M   = $0.0006
  Output: ~250 токенов × $15/1M  = $0.0037
  Итого:  ~$0.004 за слайд (~0.4 руб)

Допромптинг 1 слайда:
  Input:  ~400 токенов × $3/1M   = $0.0012
  Output: ~200 токенов × $15/1M  = $0.003
  Итого:  ~$0.004 за допромптинг (~0.4 руб)
```

**Экономика по планам:**

| План | Цена | Лимит слайдов | Макс. расход API | Маржа |
|---|---|---|---|---|
| Free | 0 ₽ | 30 | ~12 руб | -12 руб (маркетинг) |
| Student | 490 ₽ | 150 | ~60 руб | ~430 руб (88%) |
| Pro | 1390 ₽ | безлимит (реально ~200) | ~80 руб | ~1310 руб (94%) |
| Пакет 50 | 99 ₽ | +50 слайдов | ~20 руб | ~79 руб (80%) |

**При 100 платящих (60 Student + 40 Pro) + 20 пакетов/мес:**

```
Выручка подписки:  60 × 490 + 40 × 1390 = 29,400 + 55,600 = 85,000 руб
Выручка пакетов:   20 × 170 (средний)   =                    3,400 руб
Итого выручка:                                               88,400 руб

Расходы API:       ~4,000 руб
Инфраструктура:    ~1,500 руб
Комиссии ЮKassa:   ~3,100 руб
Итого расходы:     ~8,600 руб

Прибыль:           ~79,800 руб/мес (~$870) — маржа 90%
```

---

### Механики роста выручки

**1. Годовая скидка**
24% скидка за оплату года. Student: 4 469 ₽/год вместо 5 880 ₽. Pro: 12 677 ₽/год вместо 16 680 ₽. Улучшает cash flow и снижает churn.

**2. Grandfathering**
"Зарегистрируйтесь сейчас — зафиксируйте цену навсегда." На старте увеличивает конверсию первых 100 пользователей.

**3. Slide Packs**
Разовые докупки как описано выше. Конвертируют пользователей, которые не готовы к подписке.

**4. Реферальная программа**
За приглашённого платящего пользователя — +50 слайдов в подарок (или 99 ₽ на счёт). Дешевле платной рекламы.



## 8. Роадмап запуска

### Неделя 1-2: Ядро

- [ ] Настройка Django + PostgreSQL (Railway) + React (Vite)
- [ ] Интеграция Claude API (генерация JSON)
- [ ] Базовый рендер через Reveal.js (2-3 темы)
- [ ] Регистрация/логин (djangorestframework-simplejwt)
- [ ] Трекинг лимитов в БД

### Неделя 3: Продукт

- [ ] Полный пользовательский флоу (промпт → просмотр → сохранение)
- [ ] PDF экспорт через weasyprint
- [ ] **PPTX экспорт через python-pptx** — заголовок + буллеты + цвета темы
- [ ] **AI-допромптинг слайда** — `/api/refine-slide` + UI-панель при клике на слайд
- [ ] Водяной знак для бесплатных (в PDF и PPTX)
- [ ] Дашборд с историей презентаций
- [ ] ЮKassa подписка для РФ + LemonSqueezy для зарубежа

### Неделя 4: Полировка

- [ ] Лендинг с примерами генерации
- [ ] Онбординг: пустое состояние, подсказки
- [ ] Email-триггеры (добро пожаловать, лимит, апгрейд)
- [ ] Базовая аналитика (Plausible или простой логгинг)
- [ ] Тестирование с 5-10 реальными пользователями

### Неделя 5-6: Запуск

- [ ] Фикс всех критических багов
- [ ] Product Hunt: подготовка материалов
- [ ] Reddit/Twitter: "build in public" посты
- [ ] **ЗАПУСК**
- [ ] Сбор обратной связи (встроенная форма или Intercom)

### После запуска (месяц 2+)

На основе фидбека — один из путей:
- Добавить больше тем/шаблонов
- Интеграция Unsplash API для автоматических картинок
- Добавить базовое ручное редактирование (изменить текст прямо на слайде)
- AI-чат по всей презентации ("сократи всё, сделай под pitch deck")

---

## 9. Риски и как их митигировать

### Риск 1: Качество генерации — главная угроза

**Проблема:** Claude может генерировать слишком длинные буллеты, плохую структуру, не то количество слайдов.

**Митигация:**
- Добавьте постобработку: обрезка длинных строк, валидация структуры
- Retry логика: если JSON невалидный — повторить запрос автоматически
- Тестируйте на 50+ промптах до запуска
- Дайте пользователю кнопку "Перегенерировать"

### Риск 2: Высокая стоимость API при росте

**Проблема:** При 1000 пользователей стоимость Claude API может стать значимой.

**Митигация:**
- Кэшируйте похожие запросы (если тема идентична — вернуть кэш с вариацией)
- Ограничивайте бесплатный план жёстко
- Следите за Cost per User метрикой с первого дня
- При необходимости — переключитесь на более дешёвую модель (Haiku) для бесплатного плана

### Риск 3: Конкуренция с Gamma и Canva

**Проблема:** Большие игроки могут скопировать нишевые фичи.

**Митигация:**
- Не конкурируйте по фичам — конкурируйте по нише и локализации
- Фокус на сегменте, которому Gamma не уделяет внимания
- Быстрее итерируйте по фидбеку — у вас нет бюрократии

### Риск 4: Нет пользователей после запуска

**Проблема:** Product Hunt может не дать трафик, Reddit может заблокировать.

**Митигация:**
- Перед запуском — соберите waiting list хотя бы из 50 человек (друзья, коллеги, LinkedIn)
- Делайте демонстрации лично в Zoom с потенциальными пользователями
- Если не зашёл один канал — тестируйте следующий, не паникуйте

### Риск 5: Churn (отток платящих)

**Проблема:** Пользователи подписываются, используют пару раз и отменяют.

**Митигация:**
- Email-триггеры: напоминайте о неиспользованных генерациях
- Онбординг: покажите все возможности в первый день
- NPS-опрос через 7 дней: что не понравилось?
- Если churn > 10%/мес — проблема в продукте, не в маркетинге

---

## 10. Финансовая модель

### Сценарий "Реалистичный" (12 месяцев)

```
Месяц 1 (запуск):
  Регистрации: 300
  Конверсия в платных: 2% = 6 чел
  MRR: ~$60

Месяц 3:
  Регистрации накоп: 1,000
  Платных: 30 чел
  MRR: ~$300

Месяц 6:
  Регистрации накоп: 3,000
  Платных: 100 чел (Стартер 60 + Pro 40)
  MRR: 60×$5 + 40×$15 = $300 + $600 = $900

Месяц 12:
  Регистрации накоп: 8,000
  Платных: 250 чел (Стартер 150 + Pro 100)
  MRR: 150×$5 + 100×$15 = $750 + $1,500 = $2,250
  ARR: ~$27,000
```

### Расходы на 12 месяцев

```
Claude API: ~$200-400/мес (при 250 платных + бесплатные)
Инфраструктура: ~$20-50/мес
Домен + SSL: $15/год
Stripe комиссия: ~2.9% + $0.30 = ~$80/мес при $2,250 MRR
Итого расходы: ~$350/мес к месяцу 12
```

### Прибыль к месяцу 12

```
MRR: $2,250
Расходы: $350
Прибыль: ~$1,900/мес (~$22,800/год)
Маржа: ~84%
```

Это не $100M ARR, но это **реальный, прибыльный пет-проект** на пассивном доходе, который можно продать за 24-36× MRR (~$50K-80K) на платформах типа Acquire.com или Microacquire, или вырастить дальше.

---

## Итоговый чеклист для старта

### Перед началом разработки
- [ ] Зарегистрировать домен (namecheap ~$10/год)
- [ ] Создать аккаунт Anthropic и получить API ключ
- [ ] Создать проект в Supabase (бесплатно)
- [ ] Создать аккаунт Vercel (бесплатно)
- [ ] Зарегистрировать Stripe (бесплатно)

### Минимальные технические требования для MVP
- [ ] Генерация презентации за < 45 секунд
- [ ] Стабильный JSON от Claude (retry при ошибках)
- [ ] Reveal.js рендер хотя бы с 3 темами
- [ ] PDF экспорт
- [ ] Регистрация и лимиты
- [ ] Stripe Checkout для одного тарифа

### Перед запуском
- [ ] Протестировать с 10 реальными людьми
- [ ] Лендинг с примером презентации (не рассказывайте — показывайте)
- [ ] Подготовить материалы для Product Hunt
- [ ] Написать 3 поста в Twitter/LinkedIn о процессе разработки

---

## Вывод

Gamma сделала $100M ARR — но это результат идеального тайминга, отличной команды и нескольких лет работы. Ваша цель другая: **валидировать спрос, запустить рабочий продукт и выйти на $1-2K MRR за 6-12 месяцев**.

Это достижимо при следующих условиях:
1. Строгое следование MVP — не добавляйте фичи до первых 50 платящих
2. Ранняя монетизация — не делайте слишком щедрый бесплатный план
3. Публичная разработка — ваш маркетинг начинается в день 1, не в день запуска
4. Фокус на нише — русскоязычный рынок, конкретная аудитория (стартаперы, консультанты)

**Главный совет:** Лучший момент запустить — сейчас. Худший — когда продукт "будет идеальным".

---

*Документ подготовлен на основе анализа публичных данных о Gamma, Tome, Beautiful.ai и рынке AI-инструментов. Все финансовые прогнозы — оценочные.*
