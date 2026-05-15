/**
 * Translation + AI Voice Audio Router
 * Handles per-language PDF translation and TTS audio generation for digital products
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { digitalProductTranslations } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "./_core/env";

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
];

// The full guide content (clean, no Inkfluence references)
const GUIDE_CONTENT = {
  title: "DISCIPLINE MINDSET: Control Your Mind. Master Your Life.",
  subtitle: "The BUILD LEVEL Guide to Unbreakable Mental Strength",
  tagline: "CONTROL YOUR MIND. MASTER YOUR LIFE.",
  brand: "BUILD LEVEL",
  intro: `If you're trying to get fit, build a business, and stay productive, you've probably noticed the same pattern: motivation spikes, life hits, and your routine quietly collapses. You're not lazy — you're operating on mood, not a system, and that's why results feel inconsistent.

This guide gives you a practical way to turn discipline into identity and execution. You'll learn how to build your focus engine, apply the five pillars of mental discipline, install daily protocols that run even when you don't feel like it, and handle failure without identity collapse — so this guide becomes your personal operating manual.`,

  chapters: [
    {
      number: 1,
      title: "Discipline as Identity, Not Mood",
      subtitle: "The Pattern",
      content: `The moment your discipline slips, it doesn't feel like "failure." It feels like a mood. One small delay turns into a whole day, and you tell yourself a story: "I'll lock in tomorrow." But the real pattern is sneakier than that. It's a loop where your brain treats discipline like a vibe you borrow instead of a standard you embody.

You'll recognize it fast in your body. You wake up with a plan, then something hits — an email, a craving, a training session that looks "too hard," a meeting that runs long. Your mind starts scanning for reasons to wait. You negotiate with yourself in tiny moves: "Just 10 minutes," "After I eat," "When I'm less tired." Then you do the thing that feels good right now, and discipline gets filed under "later." That's the Standard-Identity Loop in action: you act like a temporary version of yourself, not the permanent one.

A New Perspective: What if discipline isn't something you have — what if it's something you are? Not "I'm trying to be disciplined," but "I'm the kind of man who executes even when it's not convenient." When you treat discipline like a mood, you're always at war with your own feelings. If discipline is identity, then your feelings don't get veto power.

Breaking It Down: Your discipline leak isn't random. It's a predictable chain reaction. When you hit a trigger (tired, distracted, a problem pops up), you feel resistance that sounds reasonable. So you delay the action that proves your standard. Which leads to a bigger identity gap: you acted like a temporary version of yourself again.

The alternative chain: when you hit the same trigger, you immediately label it as a "Standard-Identity Test." You feel the same resistance, but you don't negotiate with it — you treat it like weather. So you execute the smallest version of the standard right then. Which leads to a clean win: your actions and identity line up.

Take Action — The Standard-Identity Switch (3-Day Start):
Step 1 (Tonight, 5 minutes): Write your standard. Pick one daily action that proves who you are. Make it measurable and non-negotiable. Write it as a sentence: "I am the kind of man who ___ every day at ___."
Step 2 (Tomorrow, within the first 10 minutes of resistance): Execute the smallest version. When you feel the "I don't feel like it" signal, you do the smallest start — no negotiating.
Step 3 (Tomorrow night, 3 minutes): Run the Standard-Identity Loop check. Answer: "What triggered me?" and "What did I execute anyway?"

What You Now Know: Discipline isn't a mood you wait for — it's a standard you embody on purpose. When you build that identity link, your brain stops treating execution like a reward and starts treating it like a rule.`,
    },
    {
      number: 2,
      title: "Build Your Focus Engine",
      subtitle: "The Starting Point",
      content: `If your focus keeps "disappearing," it's probably not your willpower — it's your environment and attention system leaking.

Here's the part most men miss: they treat focus like a mood. If they "feel locked in," they grind. If they don't, they scroll, snack, switch tabs, and call it a rough day. Then they wonder why mental noise wins every time. Willpower gets burned, dopamine gets yanked around like a loose wire, and your day turns into a chain of tiny interruptions that never fully count as progress.

The Core Insight: You're not building discipline by trying harder. You're building it by designing where your attention goes before you need it. That's why architecture matters — because the mind doesn't run on intentions. It runs on cues, friction, and defaults. When you reduce mental noise and control attention, execution stops being a heroic act and becomes the default behavior.

The Attention Board System: Think of attention like electricity. You can call it "power," "energy," or "drive," but if your wiring is a mess, the lights flicker and nothing runs smoothly. The Attention Board System is how you wire focus. It's your dedicated board — physical or digital — where you place what your attention is responsible for right now, and what it is forbidden to touch until that task is done.

This Week's Experiment — The Attention Board Week (Day 7-12):
Day 1: Build your board + set your attention boundaries. Create your Attention Board System: one space that shows the next action and the current objective only.
Day 2: Reduce mental noise with "one tool, one task." Keep only the tool you need open for the task listed on your board.
Day 3: Dopamine control — delay the "reward." Pick one dopamine trigger you normally use during work and create a delay rule.
Day 4: Tactical attention drills (micro-reset). Set a timer for 10 minutes. Execute without changing your task.
Day 5: Design your work environment to make execution the default. Lock your "starting position": same desk setup, same board location, same tools every time.

The One Thing to Remember: Your focus isn't a personality trait — it's an engineered landing spot, and the Attention Board System makes execution the default.`,
    },
    {
      number: 3,
      title: "The Five Pillars of Mental Discipline",
      subtitle: "Picture This",
      content: `You're three days into a "clean streak." Sleep's decent. Training's on track. Work's moving. And then — right when you'd expect it to get easier — something hits. A client delays a decision. Your pump goes out mid-session. Your motivation drops like a bad lift.

Here's the trap: you don't actually lose discipline because you're lazy. You lose it because your emotional system grabs the wheel. One bad moment turns into sloppy effort. Sloppy effort turns into "I'll fix it tomorrow." Tomorrow becomes next week. And suddenly your "unstoppable" routine is just a memory.

The Mindset Shift: Old Belief: Discipline is what you have when you feel ready. New Reality: Discipline is what you do when you don't feel ready. Unbreakable mental discipline isn't a feeling — it's a system that keeps effort consistent even when emotions try to bargain.

The P.I.L.L.A.R.S. Training Model:
P — Presence: Get out of the story and into the moment. Name what's happening right now.
I — Intent: Decide the single priority for the next 15 minutes (not the whole day).
L — Leash Emotion: Stop emotional escalation. You don't suppress the feeling — you control what it drives.
L — Lock Focus: Narrow your attention to the next action with a tight "one-thing window."
A — Action Consistency: Execute the smallest complete action that proves you're still in control.
R — Response Under Pressure: Choose the move you'd normally avoid (the hard rep, the uncomfortable call, the delayed task).
S — Strategic Review: Quick after-action check: what triggered you, what worked, what you'll adjust next run.

Day 13-18 Pressure Drill — P.I.L.L.A.R.S. in Real Time: For the next 5 days, you'll run the P.I.L.L.A.R.S. sequence every time you feel yourself slipping — especially during business stress or training friction. Log it in one line: trigger → pillar that saved you → result.

Key Takeaway: Unbreakable discipline is a pressure response, not a personality trait. You build discipline-focus by using P.I.L.L.A.R.S. as a repeatable sequence, not a hope.`,
    },
    {
      number: 4,
      title: "Install Daily Protocols That Execute",
      subtitle: "What Changes Everything",
      content: `Either your routines run your day, or your day steals your discipline.

The first real breakthrough isn't a new workout, a new business idea, or a new spreadsheet. It's a small shift in control: stop "trying to be disciplined" and start executing a daily protocol that can't be negotiated with.

What all these have in common: They don't rely on mood. They use routines to remove decisions. They protect the next action when the day goes sideways.

Here's the principle: discipline is what you do when you don't feel like it — through structure. When your morning and evening aren't consistent, your brain treats each day like a fresh negotiation. You pay effort just to decide. But when you run daily protocols, you stop negotiating with yourself and start operating.

The 3-Block Execution Protocol:
Morning Routine (Block 1): Start the day with your fixed routine — same start time window, same sequence. If you can't do it fully, do the smallest version you can complete without bargaining.
Daily Execution Blocks (Block 2 & Block 3): Choose two blocks for your hardest priorities. Set them like appointments. Work until the block ends, then stop.
Evening Routine (Block 3 closure): Close the loop: write tomorrow's first action and lock the time you'll shut down. You're training your brain to stop carrying unfinished business.
No-zero rule: If you miss any part, you don't "start over." You perform the smallest next protocol action within 30 minutes of realizing you missed.

Your 7-Day Challenge — Protocol Lock (3-Block + No-Zero): Difficulty level: High (because it forces consistency, not "average effort"). This challenge is built to hit mental toughness from two angles: repeatability (routines and blocks) and recovery (no-zero). You're not just building discipline — you're building a discipline that survives real life.

Chapter Summary: Your routines plus daily execution blocks create discipline that doesn't depend on mood. Lock your morning and evening routines so your brain stops negotiating your day. Run The 3-Block Execution Protocol to turn priorities into scheduled actions, not wishes.`,
    },
    {
      number: 5,
      title: "Failure Without Identity Collapse",
      subtitle: "The Pattern",
      content: `"Failure isn't the event. It's the meaning you slap onto it — then the speed you move afterward."

The problem isn't the failure. It's what happens next: the pause turns into a story, the story turns into identity fear, and suddenly your next action is "protect yourself" instead of "solve the problem." That's the identity collapse trap — failure becomes a verdict.

So here's your target for Day 25-30: handle failure like a strategist — respond faster, learn without self-betrayal, and rebuild momentum immediately. You'll use the Rapid Debrief & Rebuild Protocol — a structure that forces your mind to stay useful instead of dramatic.

A New Perspective: What if the real failure wasn't the result — it was the time you spent protecting your identity instead of fixing the situation? If failure is the signal, then your job is to read the signal, not negotiate with your ego. The fastest performers don't avoid pain — they minimize the window where pain gets to steer.

The Rapid Debrief & Rebuild Protocol (Day 25-30 Starter):
Step 1 (5 minutes, Easy): Write the failure like a mechanic. Title it with the outcome, then list only facts: what happened, when, and what you expected. No blame. No identity language.
Step 2 (10 minutes, Medium): Extract the controllable lever and set one recovery rule. Answer: "What can I control next time?" Pick exactly one lever. Then write a recovery rule that prevents identity collapse from steering you.
Step 3 (15 minutes, Hard): Execute one rebuild action immediately — before you feel ready. Choose the smallest action that advances the fix. Do it today.

What You Now Know: Failure doesn't have to touch your identity — you can keep it in the lane of learning. You don't need to become a different man. You need a faster response, cleaner observation, and a recovery rule that stops self-betrayal before it starts.

Your 30-Day Journey:
Days 1-7 Foundation: Track one behavior moment — write what happened, how you felt, and what you chose next.
Days 8-14 Building: Run a short daily execution systems check — one small action you complete even if you don't feel like it.
Days 15-21 Integration: Do a daily reflection prompt: what was the signal, what was the controllable lever, what's the next action?
Days 22-30 Mastery: Use the Rapid Debrief & Rebuild Protocol after every meaningful miss, then execute one recovery action the same day.

Final Encouragement: Discipline isn't a personality trait you either have or don't have. It's a set of choices you repeat until they feel automatic. When failure hits, don't ask "Why did this happen to me?" Ask "What's the signal, and what's the next move?"

BUILD LEVEL Code: Debrief fast. Rebuild faster. Keep my identity out of it.`,
    },
  ],
  finalThoughts: `Here's the shift: you stop trying to "find discipline" and start installing it — so your actions match who you're becoming, not how you feel today.

Your first action: pick one non-negotiable daily block (30 minutes) and write your protocol for it tonight — time, task, and start cue. Start tomorrow for 14 days; if you stick to the protocol, you'll feel the identity change before you see the full results.

That's the real payoff behind the Discipline Mindset guide.

BUILD LEVEL Code: Built in silence. Destined to win.`,
};

// Generate TTS audio using Forge API
async function generateTTSAudio(text: string, language: string): Promise<Buffer | null> {
  try {
    const forgeBaseUrl = (ENV.forgeApiUrl || "").replace(/\/+$/, "");
    const forgeKey = ENV.forgeApiKey;
    if (!forgeBaseUrl || !forgeKey) return null;

    // Map language codes to TTS voice names
    const voiceMap: Record<string, string> = {
      en: "alloy",
      es: "alloy",
      fr: "alloy",
      pt: "alloy",
      de: "alloy",
      it: "alloy",
      ar: "alloy",
      zh: "alloy",
      ja: "alloy",
      ko: "alloy",
      ru: "alloy",
      hi: "alloy",
      sw: "alloy",
    };

    const voice = voiceMap[language] || "alloy";

    const response = await fetch(`${forgeBaseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${forgeKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      console.error("[TTS] Error:", response.status, await response.text());
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[TTS] Exception:", err);
    return null;
  }
}

// Translate text using LLM
async function translateText(text: string, targetLanguage: string, languageName: string): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system" as const,
        content: `You are a professional translator specializing in motivational and self-development content. Translate the following text to ${languageName} (${targetLanguage}). Rules: Maintain the same tone: direct, motivational, masculine, BUILD LEVEL brand voice. Keep all proper nouns in English: BUILD LEVEL, P.I.L.L.A.R.S., Standard-Identity Loop, Attention Board System, 3-Block Execution Protocol, Rapid Debrief & Rebuild Protocol. Keep chapter titles and section headers in the target language. Do NOT add any notes, explanations, or translator comments. Return ONLY the translated text, nothing else.`,
      },
      {
        role: "user" as const,
        content: text,
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : text;
}

export const translationRouter = router({
  // Get supported languages
  getSupportedLanguages: publicProcedure.query(() => {
    return SUPPORTED_LANGUAGES;
  }),

  // Get all translations for a product
  getProductTranslations: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(digitalProductTranslations)
        .where(eq(digitalProductTranslations.productId, input.productId));
      return rows;
    }),

  // Get a single translation by language
  getTranslation: publicProcedure
    .input(z.object({ productId: z.number(), language: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(digitalProductTranslations)
        .where(
          and(
            eq(digitalProductTranslations.productId, input.productId),
            eq(digitalProductTranslations.language, input.language)
          )
        );
      return rows[0] || null;
    }),

  // Request a translation (starts the async process)
  requestTranslation: publicProcedure
    .input(
      z.object({
        productId: z.number(),
        language: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const lang = SUPPORTED_LANGUAGES.find((l) => l.code === input.language);
      if (!lang) throw new Error("Unsupported language");

      // Check if already exists
      const existing = await db
        .select()
        .from(digitalProductTranslations)
        .where(
          and(
            eq(digitalProductTranslations.productId, input.productId),
            eq(digitalProductTranslations.language, input.language)
          )
        );

      if (existing[0]) {
        if (existing[0].status === "ready") {
          return { status: "ready", id: existing[0].id };
        }
        if (existing[0].status === "translating" || existing[0].status === "generating_audio") {
          return { status: existing[0].status, id: existing[0].id };
        }
        // Reset error state
        await db
          .update(digitalProductTranslations)
          .set({ status: "pending", errorMessage: null })
          .where(eq(digitalProductTranslations.id, existing[0].id));
        return { status: "pending", id: existing[0].id };
      }

      // Insert new pending record
      const [result] = await db.insert(digitalProductTranslations).values({
        productId: input.productId,
        language: input.language,
        languageName: lang.name,
        status: "pending",
      });

      return { status: "pending", id: (result as any).insertId };
    }),

  // Process translation (called by frontend polling — does the actual work)
  processTranslation: publicProcedure
    .input(z.object({ translationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db
        .select()
        .from(digitalProductTranslations)
        .where(eq(digitalProductTranslations.id, input.translationId));
      const record = rows[0];
      if (!record) throw new Error("Translation record not found");
      if (record.status === "ready") return { status: "ready" };
      if (record.status === "translating" || record.status === "generating_audio") {
        return { status: record.status };
      }

      const lang = SUPPORTED_LANGUAGES.find((l) => l.code === record.language);
      if (!lang) throw new Error("Unsupported language");

      try {
        // Step 1: Translate all content
        await db
          .update(digitalProductTranslations)
          .set({ status: "translating" })
          .where(eq(digitalProductTranslations.id, input.translationId));

        // Build the full text to translate
        const fullText = buildFullText();
        const translatedText = await translateText(fullText, record.language, lang.name);

        // Build audio script (stored for browser TTS — no server-side audio generation needed)
        const audioScript = buildAudioScript(translatedText, record.language, lang.name);

        // Mark as ready — browser will use Web Speech API for voice narration
        await db
          .update(digitalProductTranslations)
          .set({
            status: "ready",
            translatedText,
            audioUrl: null, // Browser TTS used instead of server audio file
            audioDuration: estimateDuration(audioScript),
          })
          .where(eq(digitalProductTranslations.id, input.translationId));

        return { status: "ready", audioUrl: null };
      } catch (err: any) {
        await db
          .update(digitalProductTranslations)
          .set({ status: "error", errorMessage: err?.message || "Unknown error" })
          .where(eq(digitalProductTranslations.id, input.translationId));
        throw err;
      }
    }),
});

function buildFullText(): string {
  const lines: string[] = [];
  lines.push(GUIDE_CONTENT.title);
  lines.push(GUIDE_CONTENT.subtitle);
  lines.push("");
  lines.push("INTRODUCTION");
  lines.push(GUIDE_CONTENT.intro);
  lines.push("");

  for (const ch of GUIDE_CONTENT.chapters) {
    lines.push(`CHAPTER ${ch.number}: ${ch.title}`);
    lines.push(ch.content);
    lines.push("");
  }

  lines.push("FINAL THOUGHTS");
  lines.push(GUIDE_CONTENT.finalThoughts);
  return lines.join("\n");
}

function buildAudioScript(translatedText: string, _language: string, _languageName: string): string {
  // Use the first ~3000 characters of the translated text for audio
  // This gives roughly 3-4 minutes of audio
  const maxChars = 3000;
  if (translatedText.length <= maxChars) return translatedText;
  return translatedText.substring(0, maxChars) + "...";
}

function estimateDuration(text: string): string {
  // Average speaking rate: ~150 words per minute
  const words = text.split(/\s+/).length;
  const minutes = Math.round(words / 150);
  return `~${minutes} min`;
}
