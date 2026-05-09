import { useEffect, useRef, useState } from "react";

/**
 * Анимированный плейсхолдер: по очереди печатает примеры запросов символ за
 * символом, держит готовую строку небольшую паузу, стирает её и переходит к
 * следующему примеру. Если поле перестаёт быть пустым (`paused=true`),
 * анимация останавливается и текущий буфер очищается, чтобы placeholder не
 * мешал введённому пользователем тексту.
 *
 * Возвращает текущую строку плейсхолдера — её можно подставить прямо в
 * атрибут `placeholder` у textarea/input.
 */
export function useTypewriterPlaceholder(
  examples,
  { typeMs = 55, eraseMs = 28, holdMs = 1500, gapMs = 320, paused = false } = {},
) {
  const [text, setText] = useState("");
  const examplesRef = useRef(examples);
  examplesRef.current = examples;

  useEffect(() => {
    if (paused) {
      setText("");
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let exampleIndex = 0;
    let pos = 0;
    let phase = "type"; // "type" | "hold" | "erase" | "gap"

    const schedule = (delay, fn) => {
      if (cancelled) return;
      timer = setTimeout(fn, delay);
    };

    const step = () => {
      if (cancelled) return;
      const list = examplesRef.current || [];
      if (list.length === 0) return;
      const phrase = list[exampleIndex % list.length] || "";

      if (phase === "type") {
        pos = Math.min(phrase.length, pos + 1);
        setText(phrase.slice(0, pos));
        if (pos >= phrase.length) {
          phase = "hold";
          schedule(holdMs, step);
        } else {
          schedule(typeMs, step);
        }
        return;
      }

      if (phase === "hold") {
        phase = "erase";
        schedule(eraseMs, step);
        return;
      }

      if (phase === "erase") {
        pos = Math.max(0, pos - 1);
        setText(phrase.slice(0, pos));
        if (pos <= 0) {
          phase = "gap";
          exampleIndex += 1;
          schedule(gapMs, step);
        } else {
          schedule(eraseMs, step);
        }
        return;
      }

      if (phase === "gap") {
        phase = "type";
        schedule(typeMs, step);
      }
    };

    schedule(typeMs, step);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paused, typeMs, eraseMs, holdMs, gapMs]);

  return text;
}

/** Дефолтный набор примеров запроса — используем и на лендинге, и в редакторе. */
export const HERO_EXAMPLE_PROMPTS = [
  "стратегия запуска ИИ-продукта для B2B SaaS на 5 слайдов",
  "питч стартапа для инвесторов: проблема, решение, рынок, команда — 8 слайдов",
  "квартальный отчёт продаж для команды на 10 слайдов",
  "презентация курса по Python для студентов на 7 слайдов",
  "внутренний онбординг для новых дизайнеров на 6 слайдов",
  "разбор UX-кейса для портфолио: контекст, исследование, результат — 9 слайдов",
];
