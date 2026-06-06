package dev.mindees.example

import android.view.Choreographer

/**
 * Drives the JS animation frame loop from Android vsync via [Choreographer] — but **only while
 * active**. The JS side (`createNativeApp`) calls `MindeesHostFrame.setFrameLoopActive(true)` the
 * instant an animation arms and `(false)` the instant the last one settles, so an idle app posts
 * **zero** frame callbacks (no 60fps busy-loop). Construct and use on the UI thread (Choreographer is
 * UI-thread-only).
 *
 * @param tick called once per vsync with the frame time in milliseconds (`frameTimeNanos / 1e6`).
 */
class FrameDriver(private val tick: (Double) -> Unit) {
    private var running = false

    // An explicit anonymous object (NOT a SAM lambda): the body re-posts `this`, and a lambda that
    // referenced its own `val` would make Kotlin's type inference recurse.
    private val callback: Choreographer.FrameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!running) return
            tick(frameTimeNanos / 1_000_000.0)
            // Re-perpetuate ONLY while running; setActive(false) simply stops re-posting, so the loop
            // dies after the in-flight frame — nothing to cancel, no leaked callback.
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    /** Start (true) or stop (false) the vsync loop. Idempotent. */
    fun setActive(active: Boolean) {
        if (active == running) return
        running = active
        if (active) Choreographer.getInstance().postFrameCallback(callback)
    }
}
