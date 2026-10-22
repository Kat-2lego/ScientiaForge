/* =========================================================
   HANDS-FREE TURN TAKING
   Decides when a learner has finished speaking, from a stream of
   loudness readings (0-1 RMS). Pure logic: no microphone, no timers,
   so it can be tested exactly.

   Learners pause a lot to find the right word, so "finished" means
   2.5 seconds of quiet AFTER real speech, not a quick gap. The page can
   always send early with the mic button.

   update(rms, nowMs) returns one of:
     "wait"     keep listening
     "stop"     they spoke and then went quiet: send it
     "give_up"  nobody spoke for a long time: stop listening
========================================================= */
(function (root) {
  "use strict";

  function createVad(options) {
    var o = Object.assign(
      { speechRms: 0.025, minSpeechMs: 300, silenceMs: 2500, maxWaitMs: 12000, maxDtMs: 250 },
      options || {}
    );
    var startedAt = null;
    var lastAt = null;
    var loudMs = 0;
    var spoke = false;
    var quietSince = null;

    return {
      update: function (rms, nowMs) {
        if (startedAt === null) startedAt = nowMs;
        // cap the gap between readings so a stalled tab can't count as "speech"
        var dt = lastAt === null ? 0 : Math.min(o.maxDtMs, Math.max(0, nowMs - lastAt));
        lastAt = nowMs;

        if (rms >= o.speechRms) {
          loudMs += dt;
          quietSince = null;
          if (!spoke && loudMs >= o.minSpeechMs) spoke = true;
          return "wait";
        }

        if (!spoke) {
          // a click or a cough is not speech: forget short blips
          loudMs = Math.max(0, loudMs - dt);
          return nowMs - startedAt >= o.maxWaitMs ? "give_up" : "wait";
        }

        if (quietSince === null) quietSince = nowMs;
        return nowMs - quietSince >= o.silenceMs ? "stop" : "wait";
      },
      spoke: function () { return spoke; },
    };
  }

  root.SFVad = { createVad: createVad };
})(typeof window !== "undefined" ? window : globalThis);