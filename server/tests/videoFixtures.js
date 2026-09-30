"use strict";
/* Clearly FAKE videos and channels for tests and the offline demo. IDs are made up
   (right format, not real YouTube videos); titles say "Demo" where they appear in the UI. */

const vid = (p) => (p + "_________________").slice(0, 11);
const ch = (p) => ("UC" + p + "0000000000000000000000").slice(0, 24);

const CH = {
  saMaths: ch("sfDemoSAMaths"),     // curated: NSC maths educator (trust 2)
  saMaths2: ch("sfDemoMatric"),     // curated: another NSC maths channel (trust 3)
  globalMaths: ch("sfDemoGlobal"),  // uncurated general maths channel
  cbse: ch("sfDemoIndia"),          // uncurated, other curriculum
  afrikaans: ch("sfDemoAfr"),
  lifeSci: ch("sfDemoBio"),
  coding: ch("sfDemoCode"),
  random: ch("sfDemoRandom"),
};

const CHANNELS = [
  { provider: "youtube", provider_channel_id: CH.saMaths, handle: "@demo-sa-maths", trust_level: 2, subjects: ["mathematics"], curricula: ["NSC"], title: "Demo SA Maths" },
  { provider: "youtube", provider_channel_id: CH.saMaths2, handle: "@demo-matric", trust_level: 3, subjects: ["mathematics", "physical-sciences"], curricula: ["NSC"], title: "Demo Matric Prep" },
  { provider: "youtube", provider_channel_id: CH.lifeSci, handle: "@demo-bio", trust_level: 2, subjects: ["life-sciences"], curricula: ["NSC"], title: "Demo Life Sciences" },
];

const days = (n) => new Date(Date.UTC(2026, 8, 1) - n * 86400000).toISOString();

const v = (id, channel_id, channel_title, title, o = {}) => ({
  provider: "youtube", provider_video_id: id, channel_id, channel_title, title,
  description: o.description || "", tags: o.tags || [], thumbnail_url: null,
  published_at: o.published_at || days(400), duration_seconds: o.duration ?? 900,
  view_count: o.views === undefined ? 50000 : o.views,
  like_count: o.likes === undefined ? 1500 : o.likes,
  comment_count: o.comments === undefined ? 120 : o.comments,
  default_language: o.lang || null, default_audio_language: o.audio || null,
  embeddable: o.embeddable !== false, privacy_status: "public", live_broadcast_content: "none",
  fetched_at: o.fetched_at || new Date(Date.UTC(2026, 8, 20)).toISOString(),
});

const VIDEOS = [
  v(vid("trigIdNSC01"), CH.saMaths, "Demo SA Maths", "Demo: Trigonometric Identities | Grade 12 NSC Exam Questions", { duration: 1440, views: 120000, likes: 5100, comments: 400, tags: ["trigonometry", "matric", "caps"], description: "Proving identities step by step for the NSC Paper 2." }),
  v(vid("trigIdGen02"), CH.globalMaths, "Demo Global Maths", "Demo: Proving Trig Identities – Worked Examples", { duration: 1080, views: 800000, likes: 20000, comments: 900 }),
  v(vid("trigCbse003"), CH.cbse, "Demo India Maths", "Demo: Trigonometric Identities Class 12 CBSE | JEE Maths", { duration: 2700, views: 10000000, likes: 200000, comments: 9000 }),
  v(vid("trigEqNSC04"), CH.saMaths2, "Demo Matric Prep", "Demo: Grade 12 Trig Equations – General Solution (NSC Paper 2)", { duration: 960, views: 45000, likes: 2100, comments: 150, tags: ["trigonometric equations", "nsc"] }),
  v(vid("trigShort05"), CH.random, "Demo Random", "Demo trig identity trick #shorts", { duration: 45, views: 2000000, likes: 90000 }),
  v(vid("trigNoEmb06"), CH.globalMaths, "Demo Global Maths", "Demo: Trigonometric identities explained", { embeddable: false, views: 300000 }),
  v(vid("trigHidden7"), CH.saMaths2, "Demo Matric Prep", "Demo: Grade 12 Trigonometric Identities – Exam Technique", { duration: 1320, views: 30000, likes: null, comments: null, tags: ["nsc", "matric"] }),
  v(vid("trigGr10_08"), CH.globalMaths, "Demo Global Maths", "Demo: Grade 10 Trigonometry Basics", { duration: 720, views: 400000, likes: 9000 }),
  v(vid("trigRev0009"), CH.saMaths, "Demo SA Maths", "Demo: Trigonometry Revision in 10 Minutes | Matric", { duration: 560, views: 60000, likes: 2500 }),
  v(vid("trigLesn010"), CH.saMaths2, "Demo Matric Prep", "Demo: Full lesson – Trigonometry Grade 12 NSC", { duration: 3720, views: 90000, likes: 3000 }),
  v(vid("trigIdNSC11"), CH.saMaths, "Demo SA Maths", "Demo: Trig Identities Grade 12 NSC – Part 2", { duration: 1200, views: 70000, likes: 3000 }),
  v(vid("trigIdNSC12"), CH.saMaths, "Demo SA Maths", "Demo: Trig Identities Grade 12 NSC – Part 3", { duration: 1150, views: 65000, likes: 2800 }),
  v(vid("trigIdNSC13"), CH.saMaths, "Demo SA Maths", "Demo: Trig Identities Grade 12 NSC – Part 4", { duration: 1100, views: 61000, likes: 2600 }),
  v(vid("trigLowV014"), CH.random, "Demo Random", "Demo: trigonometric identities grade 12", { views: 120, likes: 30, comments: 5 }),
  v(vid("trigAfr0015"), CH.afrikaans, "Demo Afrikaans Wiskunde", "Demo: Graad 12 Wiskunde – Trigonometrie identiteite (trigonometric identities)", { audio: "af", views: 8000, likes: 400 }),
  v(vid("calcRules16"), CH.saMaths, "Demo SA Maths", "Demo: Differentiation Rules – Grade 12 NSC Calculus", { duration: 1300, views: 55000, likes: 2000 }),
  v(vid("calcOpt0017"), CH.saMaths2, "Demo Matric Prep", "Demo: Optimisation – Calculus Matric Exam Questions", { duration: 1500, views: 40000, likes: 1700 }),
  v(vid("pyApiNew18"), CH.coding, "Demo Code School", "Demo: Python APIs for Beginners – requests Tutorial", { duration: 1700, views: 150000, likes: 6000, published_at: days(120) }),
  v(vid("pyApiOld19"), CH.coding, "Demo Code School", "Demo: Python APIs for Beginners – requests Tutorial (original)", { duration: 1700, views: 150000, likes: 6000, published_at: days(2900) }),
  v(vid("lsMeiosi20"), CH.lifeSci, "Demo Life Sciences", "Demo: Meiosis – Grade 12 Life Sciences (NSC)", { duration: 1100, views: 70000, likes: 3300 }),
  v(vid("lsDNAsyn21"), CH.lifeSci, "Demo Life Sciences", "Demo: DNA and Protein Synthesis Explained | Grade 12", { duration: 900, views: 52000, likes: 2400 }),
  v(vid("trigGraph22"), CH.globalMaths, "Demo Global Maths", "Demo: Trig graphs – sine and cosine graphs explained", { duration: 840, views: 350000, likes: 8000 }),
];

module.exports = { VIDEOS, CHANNELS, CH, vid, ch, days };
