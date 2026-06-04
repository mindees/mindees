if (typeof globalThis !== 'undefined' && typeof globalThis.queueMicrotask !== 'function') { globalThis.queueMicrotask = function (cb) { Promise.resolve().then(cb); }; }
(function() {

//#region \0rolldown/runtime.js
	var __defProp = Object.defineProperty;
	var __exportAll = (all, no_symbols) => {
		let target = {};
		for (var name in all) {
			__defProp(target, name, {
				get: all[name],
				enumerable: true
			});
		}
		if (!no_symbols) {
			__defProp(target, Symbol.toStringTag, { value: "Module" });
		}
		return target;
	};

//#endregion

//#region ../../../../../packages/atlas/dist/a11y.js
/**
	* Lower {@link A11yProps} to a host prop bag of `role` + `aria-*` (only keys that are defined,
	* so omitted props stay omitted — exactOptionalPropertyTypes-safe).
	*/
	function toA11yProps(a11y) {
		const out = {};
		if (a11y.role !== void 0) out.role = a11y.role;
		if (a11y.label !== void 0) out["aria-label"] = a11y.label;
		if (a11y.labelledBy !== void 0) out["aria-labelledby"] = a11y.labelledBy;
		if (a11y.describedBy !== void 0) out["aria-describedby"] = a11y.describedBy;
		if (a11y.live !== void 0) out["aria-live"] = a11y.live;
		const s = a11y.state;
		if (s) {
			if (s.disabled !== void 0) out["aria-disabled"] = String(s.disabled);
			if (s.selected !== void 0) out["aria-selected"] = String(s.selected);
			if (s.checked !== void 0) out["aria-checked"] = String(s.checked);
			if (s.expanded !== void 0) out["aria-expanded"] = String(s.expanded);
			if (s.busy !== void 0) out["aria-busy"] = String(s.busy);
			if (s.hidden !== void 0) out["aria-hidden"] = String(s.hidden);
		}
		return out;
	}

//#endregion
//#region ../../../../../packages/core/dist/reactive/reactive.js
	const CLEAN = 0;
	const CHECK = 1;
	const DIRTY = 2;
	const DISPOSED = 3;
	const equalsDefault = (a, b) => Object.is(a, b);
	/** The computation currently executing, used for automatic dependency tracking. */
	let currentObserver = null;
	/** The active disposal scope for onCleanup / child registration. */
	let currentOwner = null;
	/** Outstanding `batch()` nesting depth; effects flush when this returns to 0. */
	let batchDepth = 0;
	/** Effects marked stale and awaiting a flush. */
	const effectQueue = [];
	/** Guard against re-entrant flushes. */
	let flushing = false;
	/** Safety valve against accidental infinite reactive loops. */
	const MAX_FLUSH_ITERATIONS = 1e5;
	/** @internal Test-only handle to a node behind an accessor. Not public API. */
	const NODE = Symbol("mindees.reactive.node");
	var Computation = class {
		constructor(value, fn, equals, isEffect) {
			this.sources = null;
			this.observers = null;
			this.owned = null;
			this.cleanups = null;
			this.running = false;
			this.restaleRequested = false;
			this.value = value;
			this.fn = fn;
			this.equals = equals;
			this.isEffect = isEffect;
			this.state = fn ? DIRTY : CLEAN;
			this.initialized = fn === null;
		}
		/** Read the current value, tracking a dependency if a computation is running. */
		read() {
			if (this.state === DISPOSED) return this.value;
			if (currentObserver) link(currentObserver, this);
			if (this.fn) this.updateIfNecessary();
			return this.value;
		}
		/** Write a new value (signals only); pushes staleness to observers. */
		write(value) {
			if (this.equals !== false && this.equals(this.value, value)) return this.value;
			this.value = value;
			if (this.observers) for (const o of this.observers) o.markStale(DIRTY);
			if (batchDepth === 0) flushEffects();
			return value;
		}
		/** Color this node (and, transitively, its observers) as stale. */
		markStale(state) {
			if (this.running) {
				this.restaleRequested = true;
				return;
			}
			if (this.state < state) {
				const wasClean = this.state === CLEAN;
				this.state = state;
				if (this.isEffect && wasClean) effectQueue.push(this);
				if (this.observers) for (const o of this.observers) o.markStale(CHECK);
			}
		}
		/** Bring this node up to date, recomputing only if a source truly changed. */
		updateIfNecessary() {
			if (this.state === CLEAN || this.state === DISPOSED) return;
			if (this.state === CHECK && this.sources) for (const src of this.sources) {
				src.updateIfNecessary();
				if (this.state === DIRTY) break;
			}
			try {
				if (this.state === DIRTY) this.update();
			} finally {
				if (this.state !== DISPOSED) this.state = CLEAN;
			}
		}
		/**
		* Recompute the derivation, re-tracking dependencies and notifying observers.
		*
		* Runs in a bounded loop. If the body writes a signal it itself observes (a
		* self-write), {@link markStale} sets {@link restaleRequested} rather than the
		* mark being lost, and we recompute again so the node converges on the value it
		* just produced. The loop is capped by {@link MAX_FLUSH_ITERATIONS} so a
		* non-terminating self-writer (e.g. `effect(() => a.set(a() + 1))`) throws
		* instead of hanging. A prior-run cleanup that throws during teardown must not
		* abort the re-track/recompute (that would strand the node's children and
		* dynamic deps); its error is captured and rethrown only after the node has
		* rebuilt a consistent graph.
		*/
		update() {
			const oldValue = this.value;
			let cleanupError;
			let hasCleanupError = false;
			let iterations = 0;
			this.running = true;
			try {
				do {
					this.restaleRequested = false;
					try {
						disposeChildren(this);
					} catch (err) {
						if (!hasCleanupError) {
							cleanupError = err;
							hasCleanupError = true;
						}
					}
					unlinkSources(this);
					const prevObserver = currentObserver;
					const prevOwner = currentOwner;
					currentObserver = this;
					currentOwner = this;
					try {
						this.value = this.fn();
					} finally {
						currentObserver = prevObserver;
						currentOwner = prevOwner;
					}
					if (++iterations > MAX_FLUSH_ITERATIONS) {
						this.restaleRequested = false;
						throw new Error("MindeesNative: potential infinite reactive loop detected — a computation keeps writing a signal it reads.");
					}
				} while (this.restaleRequested);
			} finally {
				this.running = false;
			}
			const wasInitialized = this.initialized;
			this.initialized = true;
			if ((!wasInitialized || this.equals === false || !this.equals(oldValue, this.value)) && this.observers) for (const o of this.observers) o.state = DIRTY;
			if (hasCleanupError) throw cleanupError;
		}
	};
	function link(observer, source) {
		if (observer.state === DISPOSED) return;
		if (observer.sources === null) observer.sources = [];
		const sources = observer.sources;
		if (!sources.includes(source)) {
			sources.push(source);
			if (source.observers === null) source.observers = [];
			source.observers.push(observer);
		}
	}
	function unlinkSources(node) {
		if (!node.sources) return;
		for (const src of node.sources) {
			const obs = src.observers;
			if (!obs) continue;
			const idx = obs.indexOf(node);
			if (idx >= 0) {
				const last = obs.pop();
				if (last && idx < obs.length) obs[idx] = last;
			}
		}
		node.sources = null;
	}
	function disposeChildren(owner) {
		const errors = [];
		if (owner.owned) {
			const owned = owner.owned;
			owner.owned = null;
			for (const child of owned) try {
				disposeComputation(child);
			} catch (err) {
				errors.push(err);
			}
		}
		if (owner.cleanups) {
			const cleanups = owner.cleanups;
			owner.cleanups = null;
			for (const c of cleanups) try {
				c();
			} catch (err) {
				errors.push(err);
			}
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, "disposal threw");
	}
	function disposeComputation(node) {
		if (node.state === DISPOSED) return;
		if (node === currentObserver) currentObserver = null;
		if (node === currentOwner) currentOwner = null;
		try {
			disposeChildren(node);
		} finally {
			unlinkSources(node);
			node.observers = null;
			node.state = DISPOSED;
		}
	}
	function adopt(node) {
		if (!currentOwner) return;
		if (currentOwner.owned === null) currentOwner.owned = [];
		currentOwner.owned.push(node);
	}
	function flushEffects() {
		if (flushing) return;
		flushing = true;
		const errors = [];
		try {
			let i = 0;
			let iterations = 0;
			while (i < effectQueue.length) {
				if (++iterations > MAX_FLUSH_ITERATIONS) {
					effectQueue.length = 0;
					throw new Error("MindeesNative: potential infinite reactive loop detected while flushing effects.");
				}
				const e = effectQueue[i];
				i++;
				if (e && e.state !== CLEAN && e.state !== DISPOSED) try {
					e.updateIfNecessary();
				} catch (err) {
					errors.push(err);
				}
			}
		} finally {
			effectQueue.length = 0;
			flushing = false;
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, "effect(s) threw during flush");
	}
	function attachNode(accessor, node) {
		accessor[NODE] = node;
		return accessor;
	}
	/**
	* Create a writable reactive value.
	*
	* @example
	* const count = signal(0)
	* count()        // read → 0
	* count.set(1)   // write
	* count.update(n => n + 1)
	*/
	function signal(value, options) {
		const node = new Computation(value, null, options?.equals ?? equalsDefault, false);
		const accessor = (() => node.read());
		accessor.set = (v) => node.write(v);
		accessor.update = (fn) => node.write(fn(node.value));
		accessor.peek = () => node.value;
		return attachNode(accessor, node);
	}
	/**
	* Create a memoized derived value. The function re-runs only when one of the
	* reactive values it reads has actually changed, and only when the result is
	* observed (lazy).
	*
	* @example
	* const doubled = computed(() => count() * 2)
	*/
	function computed(fn, options) {
		const node = new Computation(void 0, fn, options?.equals ?? equalsDefault, false);
		adopt(node);
		const accessor = (() => node.read());
		accessor.peek = () => {
			node.updateIfNecessary();
			return node.value;
		};
		return attachNode(accessor, node);
	}
	/**
	* Run a side effect that re-runs whenever its reactive dependencies change.
	* Runs once immediately to establish dependencies.
	*
	* To clean up before each re-run and on disposal, either return a cleanup
	* function from the effect, or call {@link onCleanup}. Any non-function return
	* value is ignored (so expression-bodied effects like `() => list.push(x())`
	* are fine).
	*
	* @returns A disposer that stops the effect and runs its cleanups.
	*
	* @example
	* const stop = effect(() => console.log(count()))
	* stop() // unsubscribe
	*
	* @example
	* effect(() => {
	*   const id = setInterval(tick, 1000)
	*   return () => clearInterval(id) // cleanup
	* })
	*/
	function effect(fn) {
		const node = new Computation(void 0, () => {
			const result = fn();
			if (typeof result === "function") onCleanup(result);
		}, false, true);
		adopt(node);
		node.updateIfNecessary();
		return () => disposeComputation(node);
	}
	/** Read reactive values without subscribing the current computation to them. */
	function untrack(fn) {
		const prev = currentObserver;
		currentObserver = null;
		try {
			return fn();
		} finally {
			currentObserver = prev;
		}
	}
	/**
	* Register a cleanup to run before the owning computation re-runs and when it
	* is disposed. No-op outside a reactive scope.
	*/
	function onCleanup(fn) {
		if (!currentOwner) return;
		if (currentOwner.cleanups === null) currentOwner.cleanups = [];
		currentOwner.cleanups.push(fn);
	}
	/**
	* Create a non-tracked root scope that owns everything created within it. The
	* scope lives until the provided `dispose` function is called.
	*
	* @example
	* const dispose = createRoot((dispose) => {
	*   effect(() => console.log(count()))
	*   return dispose
	* })
	* dispose() // tear down the effect
	*/
	function createRoot(fn) {
		const root = {
			owned: null,
			cleanups: null
		};
		const prevObserver = currentObserver;
		const prevOwner = currentOwner;
		currentObserver = null;
		currentOwner = root;
		try {
			return fn(() => disposeChildren(root));
		} finally {
			currentObserver = prevObserver;
			currentOwner = prevOwner;
		}
	}

//#endregion
//#region ../../../../../packages/core/dist/component/component.js
/**
	* MindeesNative component model — a minimal, renderer-agnostic element tree plus
	* **selector-based, re-render-isolated context**.
	*
	* The element tree (`createElement` / `Fragment`) is a plain data structure: a
	* component is a function of `props` returning elements. It carries no rendering
	* logic itself — the Helix renderer (Phase 3) turns this tree into host nodes.
	*
	* The context system is the important primitive: a `createContext` value is read
	* through a **selector**, and a consumer only re-runs when its *selected slice*
	* actually changes — not on every context update. This is the re-render
	* isolation the Quantum Router (Phase 6) builds on. It is implemented on the
	* Phase 1 signals, so selection participates in normal reactivity.
	*
	* @module
	*/
	/** Brand so a renderer can reliably distinguish elements from plain objects. */
	const ELEMENT_TYPE = Symbol.for("mindees.element");
	/**
	* Create a virtual element. `type` is a host-component string or a component
	* function; `Fragment` groups children without a wrapper.
	*
	* @example
	* createElement('view', { id: 'root' }, createElement('text', null, 'hi'))
	*/
	function createElement(type, props, ...children) {
		const { key = null, children: propsChildren, ...rest } = props ?? {};
		const resolved = children.length > 0 ? children : propsChildren !== void 0 ? [propsChildren] : [];
		return {
			$$typeof: ELEMENT_TYPE,
			type,
			props: Object.freeze({ ...rest }),
			children: Object.freeze(resolved),
			key
		};
	}

//#endregion
//#region ../../../../../packages/atlas/dist/environment.js
/**
	* Platform environment + device hooks — the signal-backed equivalents of React
	* Native's `useWindowDimensions`, `useColorScheme`, `useSafeAreaInsets`, `Keyboard`.
	*
	* The environment is a small set of signals the host/runtime feeds via
	* {@link setEnvironment} (e.g. the native host on launch/rotation/theme change, or a
	* web adapter wired to `window`/`matchMedia`). The hooks return Quantum-style reactive
	* **accessors**, so reads are fine-grained — only the nodes that use a value re-run
	* when it changes (e.g. rotating the device updates exactly the layout that reads
	* window size), with no whole-tree re-render.
	*
	* @module
	*/
	const windowSignal = signal({
		width: 0,
		height: 0,
		scale: 1,
		fontScale: 1
	});
	const colorSchemeSignal = signal("light");
	const safeAreaSignal = signal({
		top: 0,
		right: 0,
		bottom: 0,
		left: 0
	});
	const keyboardSignal = signal({
		visible: false,
		height: 0
	});
	/**
	* Update the platform environment. The host/runtime calls this — once on launch and
	* again on changes (rotation, theme switch, keyboard show/hide). Only provided fields
	* change; each is a fine-grained signal write, so only the readers of that field re-run.
	*/
	function setEnvironment(env) {
		if (env.window) windowSignal.set(env.window);
		if (env.colorScheme) colorSchemeSignal.set(env.colorScheme);
		if (env.safeAreaInsets) safeAreaSignal.set(env.safeAreaInsets);
		if (env.keyboard) keyboardSignal.set(env.keyboard);
	}
	/** Reactive accessor for the window dimensions (updates on resize/rotation). */
	function useWindowDimensions() {
		return windowSignal;
	}
	/** Reactive accessor for the active color scheme (updates on theme change). */
	function useColorScheme() {
		return colorSchemeSignal;
	}

//#endregion
//#region ../../../../../packages/atlas/dist/style.js
/**
	* Merge a {@link StyleInput} (a style, or an array of styles with `false`/`null`/`undefined`
	* entries skipped) into one {@link StyleObject}; later entries win. Lets conditional styles
	* compose: `flattenStyle([base, active && activeStyle, props.style])`.
	*/
	function flattenStyle(input) {
		const out = {};
		const visit = (value) => {
			if (!value) return;
			if (Array.isArray(value)) {
				for (const v of value) visit(v);
				return;
			}
			Object.assign(out, value);
		};
		visit(input);
		return out;
	}

//#endregion
//#region ../../../../../packages/atlas/dist/host.js
/** Resolve a `Reactive<StyleInput>` to a flattened style object, or an accessor of one. */
	function resolveStyle(style) {
		if (typeof style === "function") {
			const accessor = style;
			return () => flattenStyle(accessor());
		}
		return flattenStyle(style);
	}
	/** Lower the base props (style + a11y + id/testID) to a host prop bag (omitted stays omitted). */
	function toHostProps(props) {
		const host = { ...toA11yProps(props) };
		if (props.style !== void 0) host.style = resolveStyle(props.style);
		if (props.id !== void 0) host.id = props.id;
		if (props.testID !== void 0) host["data-testid"] = props.testID;
		return host;
	}

//#endregion
//#region ../../../../../packages/atlas/dist/primitives.js
/**
	* Atlas primitives — accessible, signals-native UI building blocks. Each is a
	* `Component<P>` over `@mindees/core`'s `createElement`, returning a renderer-agnostic
	* `MindeesNode`. Web rendering is real (via the Helix DOM backend); native is a labeled 🔬
	* research track (the same serializable tree, interpreted by a native host later). See
	* `docs/adr/0022-atlas-primitives.md`.
	*
	* @module
	*/
	/** Merge a base layout style with a caller's (possibly reactive) style, staying reactive if it is. */
	function withBaseStyle(base, style) {
		if (typeof style === "function") {
			const accessor = style;
			return () => flattenStyle([base, accessor()]);
		}
		return flattenStyle([base, style]);
	}
	const View = (props) => createElement("view", toHostProps(props), props.children);
	const Text = (props) => createElement("text", toHostProps(props), props.children);
	/**
	* Create the interaction signals + host handlers a pressable surface needs. Reusable so other
	* primitives can compose interaction state. Web wires REAL DOM events (`click`, `pointer*`,
	* `focus`/`blur`, `keydown`) — never a fake cross-platform `press` event that no-ops on web.
	*/
	function usePressable(options = {}) {
		const hovered = signal(false);
		const pressed = signal(false);
		const focused = signal(false);
		const enabled = () => !options.disabled;
		const fire = () => {
			if (enabled()) options.onPress?.();
		};
		return {
			state: () => ({
				hovered: hovered(),
				pressed: pressed(),
				focused: focused()
			}),
			handlers: {
				onClick: () => fire(),
				onPointerEnter: () => {
					if (enabled()) hovered.set(true);
				},
				onPointerLeave: () => {
					if (enabled()) {
						hovered.set(false);
						pressed.set(false);
					}
				},
				onPointerDown: () => {
					if (enabled()) pressed.set(true);
				},
				onPointerUp: () => {
					if (enabled()) pressed.set(false);
				},
				onFocus: () => {
					if (enabled()) focused.set(true);
				},
				onBlur: () => {
					if (enabled()) focused.set(false);
				},
				onKeyDown: (e) => {
					const ev = e;
					if (ev.key === "Enter" || ev.key === " ") {
						ev.preventDefault?.();
						fire();
					}
				}
			}
		};
	}
	const Pressable = (props) => {
		const { state, handlers } = usePressable({
			...props.onPress ? { onPress: props.onPress } : {},
			...props.disabled ? { disabled: true } : {}
		});
		const { style, ...rest } = props;
		const host = {
			...toHostProps(rest),
			...handlers
		};
		if (!host.role) host.role = "button";
		if (props.disabled) host["aria-disabled"] = "true";
		else host.tabindex = 0;
		if (style !== void 0) host.style = typeof style === "function" && style.length >= 1 ? () => flattenStyle(style(state())) : resolveStyle(style);
		return createElement("view", host, props.children);
	};
	const Button = (props) => {
		const { title, children, ...rest } = props;
		return createElement(Pressable, rest, (Array.isArray(children) ? children.length > 0 : children != null) ? children : title !== void 0 ? createElement(Text, null, title) : null);
	};
	const Stack = (props) => {
		const { direction = "column", gap, align, justify, style, children, ...rest } = props;
		const layout = {
			display: "flex",
			flexDirection: direction,
			...gap !== void 0 ? { gap } : {},
			...align !== void 0 ? { alignItems: align } : {},
			...justify !== void 0 ? { justifyContent: justify } : {}
		};
		return createElement(View, {
			...rest,
			style: withBaseStyle(layout, style)
		}, children);
	};
	/** A horizontal {@link Stack}. */
	const Row = (props) => createElement(Stack, {
		...props,
		direction: "row"
	}, props.children);
	/** A vertical {@link Stack}. */
	const Column = (props) => createElement(Stack, {
		...props,
		direction: "column"
	}, props.children);

//#endregion
//#region ../../../../../packages/renderer/dist/headless.js
/** Whether a prop key is an event handler (`onClick`, `onPress`, …). */
	function isEventProp$1(key) {
		return key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] === (key[2] ?? "").toUpperCase();
	}

//#endregion
//#region ../../../../../packages/renderer/dist/native-protocol.js
	function isPlainObject(value) {
		const proto = Object.getPrototypeOf(value);
		return proto === Object.prototype || proto === null;
	}
	/**
	* Coerce `value` to a {@link NativePropValue}, or `undefined` if it cannot be
	* represented (signalling the prop should be removed rather than set).
	*
	* - Primitives/`null` pass through (non-finite numbers are rejected).
	* - Arrays are rejected wholesale if **any** element is unrepresentable (so
	*   element indices are never silently shifted).
	* - Plain objects keep only their representable entries (an unrepresentable value
	*   drops that key); non-plain objects (Date, Map, class instances, …) are rejected.
	*/
	function normalizeNativeProp(value) {
		return normalizeProp(value, /* @__PURE__ */ new WeakSet());
	}
	function normalizeProp(value, seen) {
		switch (typeof value) {
			case "string":
			case "boolean": return value;
			case "number": return Number.isFinite(value) ? value : void 0;
			case "object":
				if (value === null) return null;
				if (seen.has(value)) return void 0;
				seen.add(value);
				try {
					if (Array.isArray(value)) {
						const out = [];
						for (const item of value) {
							const n = normalizeProp(item, seen);
							if (n === void 0) return void 0;
							out.push(n);
						}
						return out;
					}
					if (isPlainObject(value)) {
						const out = Object.create(null);
						for (const [k, v] of Object.entries(value)) {
							const n = normalizeProp(v, seen);
							if (n !== void 0) out[k] = n;
						}
						return out;
					}
					return;
				} finally {
					seen.delete(value);
				}
			default: return;
		}
	}
	/**
	* Create a generator of unique node ids. Each call returns the next id as
	* `` `${prefix}${n}` `` with a monotonically increasing `n`. Pass a distinct
	* `prefix` per backend instance so ids from different backends never collide.
	*/
	function createNativeNodeIdFactory(prefix = "n") {
		let n = 0;
		return () => `${prefix}${++n}`;
	}

//#endregion
//#region ../../../../../packages/renderer/dist/native-command-backend.js
/**
	* Private, monotonic instance counter used only to give each backend a distinct
	* id prefix so default node ids never collide across instances. Not observable
	* outside the module; callers that want stable ids pass their own `idFactory`.
	*/
	let backendInstanceSeq = 0;
	/** `onPress` → `press`, `onPointerDown` → `pointerdown`. */
	function eventNameFor(key) {
		return key.slice(2).toLowerCase();
	}
	/**
	* Enforce the protocol's id invariant at the backend boundary: a non-finite number
	* id would silently corrupt to `null` through JSON and break node identity on the
	* wire. Throws on misuse (e.g. a custom `idFactory`/`rootId` yielding `NaN`).
	*/
	function validateNodeId(id) {
		if (typeof id === "number" && !Number.isFinite(id)) throw new TypeError(`native node id must be a string or finite number, received ${String(id)}`);
		return id;
	}
	/**
	* Create a {@link NativeCommandBackend}. Render against it to capture the native
	* command stream:
	*
	* @example
	* const backend = createNativeCommandBackend()
	* const app = render(MyComponent, {}, backend, backend.root)
	* const commands = backend.flushCommands() // replay these on a native host
	*/
	function createNativeCommandBackend(options = {}) {
		const prefix = `b${backendInstanceSeq++}`;
		const rawNextId = options.idFactory ?? createNativeNodeIdFactory(`${prefix}n`);
		const nextId = () => validateNodeId(rawNextId());
		const nextHandlerId = createNativeNodeIdFactory(`${prefix}h`);
		const rootId = validateNodeId(options.rootId ?? `${prefix}root`);
		const root = {
			id: rootId,
			kind: "element",
			tag: "root",
			text: "",
			parent: null,
			children: []
		};
		const pending = [];
		/** handlerId → handler function. The function never enters the command stream. */
		const handlers = /* @__PURE__ */ new Map();
		/** node → (eventName → handlerId), so we can unregister on change/dispose. */
		const nodeEvents = /* @__PURE__ */ new WeakMap();
		function emit(command) {
			pending.push(command);
			options.onCommand?.(command);
		}
		function applyEvent(node, eventName, value) {
			let events = nodeEvents.get(node);
			const existing = events?.get(eventName);
			if (existing !== void 0) {
				handlers.delete(existing);
				events?.delete(eventName);
				emit({
					type: "unregisterEvent",
					id: node.id,
					eventName,
					handlerId: existing
				});
			}
			if (typeof value === "function") {
				const handlerId = nextHandlerId();
				handlers.set(handlerId, value);
				if (!events) {
					events = /* @__PURE__ */ new Map();
					nodeEvents.set(node, events);
				}
				events.set(eventName, handlerId);
				emit({
					type: "registerEvent",
					id: node.id,
					eventName,
					handlerId
				});
			}
		}
		/** Tear down a removed subtree: unregister its events, dispose deepest-first. */
		function disposeSubtree(node) {
			for (const child of node.children) disposeSubtree(child);
			const events = nodeEvents.get(node);
			if (events) {
				for (const [eventName, handlerId] of events) {
					handlers.delete(handlerId);
					emit({
						type: "unregisterEvent",
						id: node.id,
						eventName,
						handlerId
					});
				}
				nodeEvents.delete(node);
			}
			emit({
				type: "disposeNode",
				id: node.id
			});
			node.parent = null;
			node.children = [];
		}
		return {
			kind: "native-command",
			rootId,
			root,
			createElement(type) {
				const node = {
					id: nextId(),
					kind: "element",
					tag: type,
					text: "",
					parent: null,
					children: []
				};
				emit({
					type: "createNode",
					id: node.id,
					tag: type
				});
				return node;
			},
			createText(value) {
				const node = {
					id: nextId(),
					kind: "text",
					tag: "",
					text: value,
					parent: null,
					children: []
				};
				emit({
					type: "createText",
					id: node.id,
					text: value
				});
				return node;
			},
			setProp(node, key, value, prev) {
				if (isEventProp$1(key)) {
					applyEvent(node, eventNameFor(key), value);
					return;
				}
				const normalized = normalizeNativeProp(value);
				if (normalized === void 0) {
					if (normalizeNativeProp(prev) !== void 0) emit({
						type: "removeProp",
						id: node.id,
						name: key
					});
					return;
				}
				emit({
					type: "setProp",
					id: node.id,
					name: key,
					value: normalized
				});
			},
			setText(node, value) {
				node.text = value;
				emit({
					type: "updateText",
					id: node.id,
					text: value
				});
			},
			insert(parent, node, anchor) {
				if (node.parent) {
					const old = node.parent;
					const oldIndex = old.children.indexOf(node);
					if (oldIndex >= 0) old.children.splice(oldIndex, 1);
					emit({
						type: "removeChild",
						parentId: old.id,
						childId: node.id
					});
				}
				let index;
				if (anchor === null) {
					index = parent.children.length;
					parent.children.push(node);
				} else {
					const at = parent.children.indexOf(anchor);
					index = at < 0 ? parent.children.length : at;
					parent.children.splice(index, 0, node);
				}
				node.parent = parent;
				emit({
					type: "insertChild",
					parentId: parent.id,
					childId: node.id,
					index
				});
			},
			remove(parent, node) {
				const at = parent.children.indexOf(node);
				if (at >= 0) parent.children.splice(at, 1);
				node.parent = null;
				emit({
					type: "removeChild",
					parentId: parent.id,
					childId: node.id
				});
				disposeSubtree(node);
			},
			parentOf(node) {
				return node.parent;
			},
			nextSibling(node) {
				const parent = node.parent;
				if (!parent) return null;
				const at = parent.children.indexOf(node);
				return at >= 0 && at + 1 < parent.children.length ? parent.children[at + 1] ?? null : null;
			},
			isText(node) {
				return node.kind === "text";
			},
			getCommands() {
				return pending.slice();
			},
			flushCommands() {
				const batch = pending.slice();
				pending.length = 0;
				options.onBatch?.(batch);
				return batch;
			},
			clearCommands() {
				pending.length = 0;
			},
			dispatchEvent(handlerId, event) {
				const handler = handlers.get(handlerId);
				if (!handler) return false;
				handler(event);
				return true;
			}
		};
	}

//#endregion
//#region ../../../../../packages/renderer/dist/render.js
/**
	* Helix reconciler — turns a MindeesNative element tree into host nodes via a
	* {@link HostBackend}, with **fine-grained reactive bindings**.
	*
	* There is no virtual-DOM diff. Instead:
	* - A dynamic prop (a function value) becomes an `effect` that patches exactly
	*   that one attribute when its signals change.
	* - A dynamic child (a function returning nodes) becomes an `effect` that
	*   replaces exactly that region of the host tree.
	* - Everything created during render is owned by a reactive scope, so unmounting
	*   disposes every binding — no leaks.
	*
	* This is the Phase 1/2 reactivity paying off: updates are O(what-changed), not
	* O(tree).
	*
	* @module
	*/
	function isElementLike(value) {
		return typeof value === "object" && value !== null && value.$$typeof === ELEMENT_TYPE;
	}
	function isEventProp(key) {
		return key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] === (key[2] ?? "").toUpperCase();
	}
	function render(a, b, c, d) {
		const isComponentForm = d !== void 0;
		const backend = isComponentForm ? c : b;
		const container = isComponentForm ? d : c;
		let nodes = [];
		let dispose;
		try {
			createRoot((d) => {
				dispose = d;
				nodes = mountNode(isComponentForm ? a(b) : a, backend, container, null);
			});
		} catch (err) {
			dispose?.();
			throw err;
		}
		return {
			nodes,
			dispose() {
				for (const n of nodes) {
					const parent = backend.parentOf(n);
					if (parent) backend.remove(parent, n);
				}
				dispose();
			}
		};
	}
	/**
	* Mount a node into `parent` before `anchor`. Returns the top-level host nodes
	* created (for fragments / arrays this can be more than one).
	*/
	function mountNode(node, backend, parent, anchor) {
		if (node === null || node === void 0 || typeof node === "boolean") return [];
		if (typeof node === "function") return bindReactiveChild(node, backend, parent, anchor);
		if (typeof node === "string" || typeof node === "number") {
			const text = backend.createText(String(node));
			backend.insert(parent, text, anchor);
			return [text];
		}
		if (Array.isArray(node)) {
			const out = [];
			for (const child of node) out.push(...mountNode(child, backend, parent, anchor));
			return out;
		}
		if (isElementLike(node)) {
			const { type } = node;
			if (typeof type === "function") return mountNode(type({
				...node.props,
				children: node.children
			}), backend, parent, anchor);
			const el = backend.createElement(type);
			for (const [key, value] of Object.entries(node.props)) bindProp(backend, el, key, value);
			mountChildren(node.children, backend, el);
			backend.insert(parent, el, anchor);
			return [el];
		}
		return [];
	}
	/** Mount a list of children into `parent`, appending in order. */
	function mountChildren(children, backend, parent) {
		for (const child of children) mountNode(child, backend, parent, null);
	}
	/**
	* Apply a prop. A function value is a **reactive binding**: an effect re-applies
	* exactly this attribute when its dependencies change. Event props (`onX`) are
	* applied once (the handler itself can close over signals).
	*/
	function bindProp(backend, el, key, value) {
		if (key === "children") return;
		if (isEventProp(key)) {
			backend.setProp(el, key, value, void 0);
			onCleanup(() => backend.setProp(el, key, void 0, value));
			return;
		}
		if (typeof value === "function") {
			let prev;
			effect(() => {
				const next = value();
				backend.setProp(el, key, next, prev);
				prev = next;
			});
			return;
		}
		backend.setProp(el, key, value, void 0);
	}
	/**
	* Bind a reactive child region: an effect that, when the accessor changes,
	* unmounts the previous nodes and mounts the new ones at the same position. A
	* stable text-only fast path patches the text node in place.
	*
	* The effect runs synchronously on creation, so `current` is populated before
	* we return it — letting the caller report the region's initial host nodes.
	*/
	function bindReactiveChild(accessor, backend, parent, initialAnchor) {
		const marker = backend.createText("");
		backend.insert(parent, marker, initialAnchor);
		const nodes = [marker];
		let content = [];
		onCleanup(() => {
			for (const n of content) if (backend.parentOf(n)) backend.remove(parent, n);
			if (backend.parentOf(marker)) backend.remove(parent, marker);
		});
		effect(() => {
			const value = accessor();
			untrack(() => {
				if (content.length === 1 && content[0] !== void 0 && backend.isText(content[0]) && (typeof value === "string" || typeof value === "number")) {
					backend.setText(content[0], String(value));
					return;
				}
				for (const n of content) if (backend.parentOf(n)) backend.remove(parent, n);
				content = mountNode(value, backend, parent, marker);
				nodes.length = 0;
				nodes.push(...content, marker);
			});
		});
		return nodes;
	}

//#endregion
//#region ../../../../../packages/renderer/dist/native-app.js
	function defaultEmit(json) {
		const host = globalThis.MindeesHost;
		if (!host || typeof host.emit !== "function") throw new Error("createNativeApp: no `emit` was provided and globalThis.MindeesHost.emit is unavailable");
		host.emit(json);
	}
	/**
	* Wire a root node to a native command host. Returns the {@link NativeApp} handle and
	* (unless `expose: false`) publishes it as `globalThis.MindeesApp` for the host to call.
	*/
	function createNativeApp(root, options = {}) {
		const backend = createNativeCommandBackend({ rootId: options.rootId ?? "host-root" });
		const emit = options.emit ?? defaultEmit;
		const flush = () => {
			const batch = backend.flushCommands();
			if (batch.length > 0) emit(JSON.stringify(batch));
		};
		const app = {
			start() {
				render(root, backend, backend.root);
				flush();
			},
			dispatchEvent(handlerId, event) {
				const handled = backend.dispatchEvent(handlerId, event);
				flush();
				return handled;
			}
		};
		const expose = options.expose ?? true;
		if (expose !== false) {
			const name = typeof expose === "string" ? expose : "MindeesApp";
			globalThis[name] = app;
		}
		return app;
	}

//#endregion
//#region ../../../../../packages/router/dist/errors.js
/** An error thrown by the Quantum router. */
	var RouterError = class extends Error {
		constructor(code, message, issues) {
			super(message);
			this.name = "RouterError";
			this.code = code;
			if (issues !== void 0) this.issues = issues;
		}
	};

//#endregion
//#region ../../../../../packages/router/dist/pattern.js
/**
	* Route patterns — matching, building, and **codegen-free** typed params.
	*
	* A pattern is a `/`-separated path where each segment is one of:
	* - a **static** segment (`posts`) — matches itself literally;
	* - a **dynamic** segment (`:postId`) — matches exactly one non-empty segment;
	* - a **catch-all** segment (`:rest*`) — must be last; matches the remaining
	*   segments (zero or more), joined with `/`.
	*
	* This mirrors the manifest paths emitted by `@mindees/compiler`
	* (`buildRouteManifest`: `[param]` → `:param`, `[...rest]` → `:rest*`).
	*
	* The headline win over Expo Router / React Router: params are typed by parsing
	* the pattern string with **template-literal types** ({@link PathParams}) — no
	* generated `.d.ts`, no dev server, and required params are typed as *required*
	* (not optional). See ADR-0003.
	*
	* @module
	*/
	/** Split a pathname into non-empty segments (tolerates leading/trailing slashes). */
	function splitPath(path) {
		return path.split("/").filter((s) => s.length > 0);
	}
	/** Reject an empty param name (`/:` or `/:*`) so downstream never sees `params['']`. */
	function requireName(name, pattern) {
		if (name.length === 0) throw new RouterError("INVALID_PATTERN", `Param name cannot be empty in pattern "${pattern}".`);
		return name;
	}
	/**
	* Parse a pattern into segments, validating it. Throws {@link RouterError}
	* (`INVALID_PATTERN`) if a catch-all is not the final segment, or a param name
	* is empty.
	*/
	function parsePattern(pattern) {
		const segments = splitPath(pattern).map((s) => {
			if (s.startsWith(":") && s.endsWith("*")) return {
				kind: "catchAll",
				value: requireName(s.slice(1, -1), pattern)
			};
			if (s.startsWith(":")) return {
				kind: "param",
				value: requireName(s.slice(1), pattern)
			};
			return {
				kind: "static",
				value: s
			};
		});
		const catchAllIndex = segments.findIndex((s) => s.kind === "catchAll");
		if (catchAllIndex !== -1 && catchAllIndex !== segments.length - 1) throw new RouterError("INVALID_PATTERN", `Catch-all segment must be last in pattern "${pattern}".`);
		return segments;
	}
	/**
	* Match a `pathname` against a `pattern`. Returns the extracted params, or
	* `null` if it does not match. Param values are URI-decoded.
	*
	* @example
	* matchPattern('/posts/:id', '/posts/42')   // { id: '42' }
	* matchPattern('/files/:rest*', '/files/a/b') // { rest: 'a/b' }
	* matchPattern('/about', '/contact')        // null
	*/
	function matchPattern(pattern, pathname) {
		const segments = parsePattern(pattern);
		const parts = splitPath(pathname);
		const params = {};
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (seg === void 0) return null;
			if (seg.kind === "catchAll") {
				params[seg.value] = parts.slice(i).map((p) => safeDecode$1(p)).join("/");
				return params;
			}
			const part = parts[i];
			if (part === void 0) return null;
			if (seg.kind === "static") {
				if (part !== seg.value) return null;
			} else params[seg.value] = safeDecode$1(part);
		}
		return parts.length === segments.length ? params : null;
	}
	/** Decode a URI segment, falling back to the raw value on malformed input. */
	function safeDecode$1(value) {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}
	/**
	* Build a pathname from a `pattern` and `params`. Param values are URI-encoded.
	* Throws {@link RouterError} (`MISSING_PARAM`) if a required dynamic param is
	* absent. A missing/empty catch-all simply contributes nothing.
	*
	* @example
	* buildPath('/posts/:id', { id: '42' })       // '/posts/42'
	* buildPath('/files/:rest*', { rest: 'a/b' }) // '/files/a/b'
	* buildPath('/about', {})                     // '/about'
	*/
	function buildPath(pattern, params = {}) {
		const segments = parsePattern(pattern);
		const out = [];
		for (const seg of segments) {
			if (seg.kind === "static") {
				out.push(seg.value);
				continue;
			}
			const value = params[seg.value];
			if (seg.kind === "param") {
				if (value === void 0 || value === "") throw new RouterError("MISSING_PARAM", `Missing value for required param ":${seg.value}" in pattern "${pattern}".`);
				out.push(encodeURIComponent(String(value)));
			} else if (value !== void 0 && value !== "") out.push(String(value).split("/").filter((s) => s.length > 0).map((s) => encodeURIComponent(s)).join("/"));
		}
		return `/${out.join("/")}`;
	}
	/** Per-segment specificity weights: static > param > (end of pattern) > catch-all. */
	const SEGMENT_WEIGHT = {
		static: 4,
		param: 3,
		catchAll: 1
	};
	/**
	* Weight for a "missing" segment slot (the pattern ended). It outranks a
	* catch-all (so the root `/` beats a bare `/:rest*`) but loses to a static or
	* dynamic segment (so a longer, more specific pattern still wins).
	*/
	const END_WEIGHT = 2;
	/**
	* Specificity score for a pattern: a per-segment weight tuple. Static segments
	* outrank dynamic, which outrank a pattern's end, which outranks a catch-all.
	* Used to sort routes so the most specific match wins.
	*/
	function score(pattern) {
		return parsePattern(pattern).map((s) => SEGMENT_WEIGHT[s.kind]);
	}
	/**
	* Compare two patterns by specificity. Returns a negative number if `a` is more
	* specific than `b` (so `routes.sort(compareSpecificity)` puts the most specific
	* first), positive if less specific, 0 if equal.
	*/
	function compareSpecificity(a, b) {
		const sa = score(a);
		const sb = score(b);
		const len = Math.max(sa.length, sb.length);
		for (let i = 0; i < len; i++) {
			const wa = sa[i] ?? END_WEIGHT;
			const wb = sb[i] ?? END_WEIGHT;
			if (wa !== wb) return wb - wa;
		}
		return 0;
	}

//#endregion
//#region ../../../../../packages/router/dist/search.js
/**
	* Search (query) params — parsing, serializing, and **typed, validated** access.
	*
	* Search params are first-class typed state in Quantum. A route declares a
	* {@link StandardSchemaV1} schema; reads are validated and fully typed via
	* {@link StandardSchemaV1.InferOutput}. This is the capability Expo Router and
	* React Router lack (they return raw, untyped strings). See ADR-0003.
	*
	* Conventions:
	* - repeated keys (`?tag=a&tag=b`) parse to a `string[]`; single keys to a `string`;
	* - coercion (string → number/boolean/date) is delegated to the schema
	*   (e.g. `z.coerce.number()`), so this module never guesses types.
	*
	* @module
	*/
	/**
	* Parse a query string into a record. Accepts an optional leading `?`. Repeated
	* keys collapse into an array, preserving order.
	*
	* @example
	* parseQuery('?page=2&tag=a&tag=b') // { page: '2', tag: ['a', 'b'] }
	*/
	function parseQuery(search) {
		const out = Object.create(null);
		const query = search.startsWith("?") ? search.slice(1) : search;
		if (query.length === 0) return out;
		for (const pair of query.split("&")) {
			if (pair.length === 0) continue;
			const eq = pair.indexOf("=");
			const rawKey = eq === -1 ? pair : pair.slice(0, eq);
			const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
			const key = safeDecode(rawKey);
			const value = safeDecode(rawValue);
			const existing = out[key];
			if (existing === void 0) out[key] = value;
			else if (Array.isArray(existing)) existing.push(value);
			else out[key] = [existing, value];
		}
		return out;
	}
	/**
	* Serialize a record into a query string (no leading `?`). `null`/`undefined`
	* values are skipped; arrays emit one `key=value` pair each. Keys are sorted for
	* deterministic, cache-friendly output.
	*
	* @example
	* stringifyQuery({ page: 2, tag: ['a', 'b'] }) // 'page=2&tag=a&tag=b'
	*/
	function stringifyQuery(query) {
		const parts = [];
		for (const key of Object.keys(query).sort()) {
			const value = query[key];
			if (value === null || value === void 0) continue;
			const encKey = encodeURIComponent(key);
			if (Array.isArray(value)) for (const item of value) parts.push(`${encKey}=${encodeURIComponent(String(item))}`);
			else parts.push(`${encKey}=${encodeURIComponent(String(value))}`);
		}
		return parts.join("&");
	}
	/**
	* Validate `input` against a Standard Schema, **without throwing** on invalid
	* input — returns a discriminated result. Throws {@link RouterError}
	* (`ASYNC_SCHEMA`) only for the programming error of passing an async schema,
	* since navigation-time parsing must be synchronous.
	*/
	function safeValidateSearch(schema, input) {
		const result = schema["~standard"].validate(input);
		if (result instanceof Promise) throw new RouterError("ASYNC_SCHEMA", "Asynchronous schemas are not supported for synchronous search-param validation.");
		if (result.issues) return {
			ok: false,
			issues: result.issues
		};
		return {
			ok: true,
			value: result.value
		};
	}
	/** Decode a URI component, falling back to the raw value on malformed input. */
	function safeDecode(value) {
		try {
			return decodeURIComponent(value.replace(/\+/g, " "));
		} catch {
			return value;
		}
	}

//#endregion
//#region ../../../../../packages/router/dist/components.js
/**
	* Render integration — `createRouterView` (renders the matched route chain) and
	* `createLink` (typed navigation links). Built on `@mindees/core`'s
	* `createElement` + signals; the renderer turns the returned function nodes into
	* fine-grained reactive regions. See ADR-0004.
	*
	* Nesting uses **explicit composition** (no ambient context): each matched route
	* component receives the next route in the chain as `children` (the outlet), and
	* the router exposes the chain as the reactive `matches` array. Each depth is a
	* reactive region keyed on that depth's route identity, so navigating a leaf
	* re-mounts only the leaf — parent layouts (and their state) are preserved.
	*
	* @module
	*/
	/** Shared idle loader state for routes without a loader. */
	const IDLE_LOADER_DATA = Object.freeze({ status: "idle" });
	/**
	* Create the router's view: a node that renders the matched route **chain**
	* top-down, nesting each child into its parent's `children` (the outlet). Render
	* it with the Helix renderer (`render(createRouterView(router), backend, root)`);
	* it re-renders fine-grainedly as navigation changes the matched routes.
	*
	* @example
	* const view = createRouterView(router, { notFound: NotFound })
	* render(view, backend, root)
	*/
	function createRouterView(router, options = {}) {
		const outletAt = (depth) => () => {
			const route = router.select((s) => s.matches[depth]?.route ?? null)();
			if (route === null) return depth === 0 && options.notFound ? createElement(options.notFound, {}) : null;
			const child = outletAt(depth + 1);
			const component = route.component;
			if (component === void 0) return child;
			return createElement(component, {
				router,
				params: router.params,
				search: router.search,
				data: () => {
					const match = router.matches()[depth];
					return match ? router.loaderData(match) : IDLE_LOADER_DATA;
				},
				children: child
			});
		};
		return outletAt(0);
	}

//#endregion
//#region ../../../../../packages/router/dist/history.js
	const ROOT = {
		pathname: "/",
		search: "",
		hash: ""
	};
	/** Parse an href string into a {@link RouterLocation} (no base required). */
	function parseHref(href) {
		let rest = href;
		let hash = "";
		const hashIndex = rest.indexOf("#");
		if (hashIndex !== -1) {
			hash = rest.slice(hashIndex);
			rest = rest.slice(0, hashIndex);
		}
		let search = "";
		const queryIndex = rest.indexOf("?");
		if (queryIndex !== -1) {
			search = rest.slice(queryIndex);
			rest = rest.slice(0, queryIndex);
		}
		return {
			pathname: rest.length === 0 ? "/" : rest.startsWith("/") ? rest : `/${rest}`,
			search,
			hash
		};
	}
	/** Serialize a {@link RouterLocation} back into an href string. */
	function createHref(location) {
		return `${location.pathname}${location.search}${location.hash}`;
	}
	/** Clamp `n` to the inclusive range `[min, max]`. */
	function clamp(n, min, max) {
		return Math.min(max, Math.max(min, n));
	}
	/**
	* Create an in-memory history. Deterministic and DOM-free — the primary tested
	* path and the right adapter for SSR, tests, and non-browser hosts.
	*/
	function createMemoryHistory(options = {}) {
		const entries = (options.initialEntries && options.initialEntries.length > 0 ? options.initialEntries : ["/"]).map(parseHref);
		let index = clamp(options.initialIndex ?? entries.length - 1, 0, entries.length - 1);
		const listeners = /* @__PURE__ */ new Set();
		const current = () => entries[index] ?? ROOT;
		const notify = () => {
			const location = current();
			for (const listener of listeners) listener(location);
		};
		const go = (delta) => {
			const next = clamp(index + delta, 0, entries.length - 1);
			if (next !== index) {
				index = next;
				notify();
			}
		};
		return {
			location: current,
			push(to) {
				entries.splice(index + 1);
				entries.push(parseHref(to));
				index = entries.length - 1;
				notify();
			},
			replace(to) {
				entries[index] = parseHref(to);
				notify();
			},
			go,
			back: () => go(-1),
			forward: () => go(1),
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}
		};
	}

//#endregion
//#region ../../../../../packages/router/dist/active.js
	let active = null;
	/** Register `router` as the active router (called by {@link createRouter}). */
	function setActiveRouter(router) {
		active = router;
	}
	/** The active router, or `null` if none has been created yet. */
	function getActiveRouter() {
		return active;
	}

//#endregion
//#region ../../../../../packages/router/dist/data.js
	const IDLE = Object.freeze({ status: "idle" });
	/** Create a loader manager. */
	function createLoaderManager(options) {
		const now = options.now ?? Date.now;
		let cache = /* @__PURE__ */ new WeakMap();
		const inFlight = /* @__PURE__ */ new Map();
		const ids = /* @__PURE__ */ new WeakMap();
		let nextId = 0;
		let disposed = false;
		const MAX_ENTRIES_PER_ROUTE = 64;
		const idOf = (route) => {
			let id = ids.get(route);
			if (id === void 0) {
				id = nextId++;
				ids.set(route, id);
			}
			return id;
		};
		const innerKey = (route, match) => {
			try {
				const deps = route.loaderDeps ? route.loaderDeps({ search: match.search }) : null;
				return JSON.stringify({
					p: match.params,
					d: deps
				});
			} catch {
				return `${JSON.stringify({ p: match.params })}::unserializable-deps`;
			}
		};
		const getEntry = (route, key) => cache.get(route)?.get(key);
		const setEntry = (route, key, entry) => {
			let m = cache.get(route);
			if (!m) {
				m = /* @__PURE__ */ new Map();
				cache.set(route, m);
			}
			m.delete(key);
			m.set(key, entry);
			if (m.size > MAX_ENTRIES_PER_ROUTE) for (const [k, e] of m) {
				if (m.size <= MAX_ENTRIES_PER_ROUTE) break;
				if (e.status !== "pending") m.delete(k);
			}
		};
		const ensure = (match) => {
			if (disposed) return;
			const route = match.route;
			const loader = route.loader;
			if (!loader) return;
			const key = innerKey(route, match);
			const gkey = `${idOf(route)}:${key}`;
			const existing = getEntry(route, key);
			const staleTime = route.staleTime ?? 0;
			if (existing?.status === "success" && now() - existing.loadedAt < staleTime) return;
			if (inFlight.has(gkey)) return;
			const controller = new AbortController();
			inFlight.set(gkey, controller);
			const pendingEntry = {
				status: "pending",
				loadedAt: existing?.loadedAt ?? 0,
				controller
			};
			if (existing?.data !== void 0) pendingEntry.data = existing.data;
			setEntry(route, key, pendingEntry);
			options.onChange();
			const ctx = {
				params: match.params,
				search: match.search,
				location: options.location(),
				signal: controller.signal
			};
			const settle = (settled) => {
				if (inFlight.get(gkey) === controller) inFlight.delete(gkey);
				if (getEntry(route, key) !== pendingEntry) return;
				setEntry(route, key, settled);
				if (!controller.signal.aborted) options.onChange();
			};
			Promise.resolve().then(() => loader(ctx)).then((data) => settle({
				status: "success",
				data,
				loadedAt: now()
			}), (error) => {
				const errored = {
					status: "error",
					error,
					loadedAt: now()
				};
				if (existing?.data !== void 0) errored.data = existing.data;
				settle(errored);
			});
		};
		const currentGlobalKeys = (matches) => {
			const keys = /* @__PURE__ */ new Set();
			for (const m of matches) if (m.route.loader) keys.add(`${idOf(m.route)}:${innerKey(m.route, m)}`);
			return keys;
		};
		const ensureSafe = (match) => {
			try {
				ensure(match);
			} catch {}
		};
		return {
			sync(matches) {
				for (const m of matches) ensureSafe(m);
				const keep = currentGlobalKeys(matches);
				for (const [gkey, controller] of inFlight) if (!keep.has(gkey)) {
					controller.abort();
					inFlight.delete(gkey);
				}
			},
			preload(matches) {
				for (const m of matches) ensureSafe(m);
			},
			read(match) {
				options.track();
				const route = match.route;
				if (!route.loader) return IDLE;
				const entry = getEntry(route, innerKey(route, match));
				if (!entry) return IDLE;
				const out = { status: entry.status };
				if (entry.data !== void 0) out.data = entry.data;
				if (entry.error !== void 0) out.error = entry.error;
				return out;
			},
			invalidate(matches) {
				for (const m of matches) {
					if (!m.route.loader) continue;
					const key = innerKey(m.route, m);
					const entry = getEntry(m.route, key);
					if (entry) entry.loadedAt = 0;
					const gkey = `${idOf(m.route)}:${key}`;
					const controller = inFlight.get(gkey);
					if (controller) {
						controller.abort();
						inFlight.delete(gkey);
					}
				}
				this.sync(matches);
			},
			dispose() {
				disposed = true;
				for (const controller of inFlight.values()) controller.abort();
				inFlight.clear();
				cache = /* @__PURE__ */ new WeakMap();
			}
		};
	}

//#endregion
//#region ../../../../../packages/router/dist/router.js
/**
	* The Quantum router — signals-native routing state with typed, validated
	* navigation and re-render isolation.
	*
	* Router state (location, params, search, matched route) is modeled as the
	* fine-grained signal graph from `@mindees/core` (Phase 1 `signal`/`computed`,
	* Phase 2 selector isolation). Consumers read a slice via {@link Router.select}
	* and re-run **only** when that slice changes — no whole-tree re-render on
	* navigation, no global-vs-local hook trap (cf. Expo Router). See ADR-0003.
	*
	* @module
	*/
	const EMPTY_PARAMS = Object.freeze({});
	const EMPTY_SEARCH = Object.freeze({});
	const EMPTY_MATCHES = Object.freeze([]);
	/** Join a parent path and a (relative) child path into a normalized full path. */
	function joinPaths(parent, child) {
		const base = parent.endsWith("/") ? parent.slice(0, -1) : parent;
		const rel = child.startsWith("/") ? child.slice(1) : child;
		if (rel.length === 0) return base.length === 0 ? "/" : base;
		return `${base}/${rel}`;
	}
	/**
	* Flatten a (possibly nested) route tree into leaf entries, each carrying its
	* full path and the root→leaf chain of records. A route with children
	* contributes only via its children (add an index child — `path: ''` — to match
	* the parent's own path).
	*/
	function flattenRouteTree(routes, parentPath, parentChain) {
		const out = [];
		for (const route of routes) {
			const fullPath = joinPaths(parentPath, route.path);
			const chain = [...parentChain, route];
			if (route.children && route.children.length > 0) out.push(...flattenRouteTree(route.children, fullPath, chain));
			else out.push({
				fullPath,
				chain
			});
		}
		return out;
	}
	/** Flatten + sort a route tree most-specific first (static > dynamic > catch-all). */
	function compileRoutes(routes) {
		return flattenRouteTree(routes, "", []).sort((a, b) => compareSpecificity(a.fullPath, b.fullPath));
	}
	/**
	* Match a location against the compiled route table, returning the matched chain
	* (root → leaf), or an empty array if nothing matched. Search is validated
	* against the **leaf** route's schema and shared across the chain.
	*/
	function matchLocation(flat, location) {
		for (const fr of flat) {
			const params = matchPattern(fr.fullPath, location.pathname);
			if (params === null) continue;
			const searchRaw = parseQuery(location.search);
			let search = searchRaw;
			let issues;
			const leaf = fr.chain[fr.chain.length - 1];
			if (leaf?.searchSchema) try {
				const result = safeValidateSearch(leaf.searchSchema, searchRaw);
				if (result.ok) search = result.value;
				else issues = result.issues;
			} catch (err) {
				issues = [{ message: err instanceof Error ? err.message : "search validation failed" }];
			}
			return fr.chain.map((route) => {
				const base = {
					route,
					pathname: location.pathname,
					params,
					search,
					searchRaw
				};
				return issues ? {
					...base,
					issues
				} : base;
			});
		}
		return EMPTY_MATCHES;
	}
	/**
	* Resolve a (possibly relative) path against a base pathname. Absolute paths
	* (leading `/`) ignore the base; `.`/`..` segments are applied against it,
	* treating the base pathname as a directory.
	*
	* @example
	* resolvePath('/a/b', '/x')      // '/a/b'
	* resolvePath('edit', '/posts/1') // '/posts/1/edit'
	* resolvePath('../', '/posts/1')  // '/posts'
	*/
	function resolvePath(to, from) {
		const stack = to.startsWith("/") ? [] : from.split("/").filter((s) => s.length > 0);
		for (const seg of to.split("/")) {
			if (seg === "" || seg === ".") continue;
			if (seg === "..") stack.pop();
			else stack.push(seg);
		}
		return `/${stack.join("/")}`;
	}
	/** Resolve an href string (which may be relative and carry query/hash) against a location. */
	function resolveHref(to, from) {
		const hasPath = to.length > 0 && to[0] !== "?" && to[0] !== "#";
		let rest = to;
		let hash = "";
		const hashIndex = rest.indexOf("#");
		if (hashIndex !== -1) {
			hash = rest.slice(hashIndex);
			rest = rest.slice(0, hashIndex);
		}
		let search = "";
		const queryIndex = rest.indexOf("?");
		if (queryIndex !== -1) {
			search = rest.slice(queryIndex);
			rest = rest.slice(0, queryIndex);
		}
		return `${hasPath ? resolvePath(rest, from.pathname) : from.pathname}${!hasPath && queryIndex === -1 ? from.search : search}${hash}`;
	}
	/** Build an href from a structured navigation target. */
	function buildHref(target) {
		const pathname = buildPath(target.to, target.params ?? {});
		const query = target.search ? stringifyQuery(target.search) : "";
		let hash = target.hash ?? "";
		if (hash.length > 0 && !hash.startsWith("#")) hash = `#${hash}`;
		return `${pathname}${query ? `?${query}` : ""}${hash}`;
	}
	/**
	* Create a router over a route table. State is reactive (signals); call
	* {@link Router.dispose} to tear it down.
	*/
	function createRouter(options) {
		const history = options.history ?? createMemoryHistory();
		let routesSig;
		let flatMemo;
		let locationSig;
		let stateMemo;
		let loaders;
		const dispose = createRoot((disposeRoot) => {
			routesSig = signal(options.routes, { equals: false });
			flatMemo = computed(() => compileRoutes(routesSig()));
			locationSig = signal(history.location(), { equals: false });
			const matchMemo = computed(() => matchLocation(flatMemo(), locationSig()));
			stateMemo = computed(() => {
				const location = locationSig();
				const matches = matchMemo();
				const leaf = matches.length > 0 ? matches[matches.length - 1] ?? null : null;
				return {
					location,
					matches,
					match: leaf,
					pathname: location.pathname,
					params: leaf ? leaf.params : EMPTY_PARAMS,
					search: leaf ? leaf.search : EMPTY_SEARCH
				};
			});
			const dataVersion = signal(0, { equals: false });
			loaders = createLoaderManager({
				location: () => locationSig(),
				onChange: () => dataVersion.set(0),
				track: () => {
					dataVersion();
				}
			});
			effect(() => loaders.sync(matchMemo()));
			const unsubscribe = history.subscribe((loc) => locationSig.set(loc));
			return () => {
				unsubscribe();
				loaders.dispose();
				disposeRoot();
			};
		});
		/** Apply the navigation guard, following redirects (capped). Returns the final href, or null to cancel. */
		const applyGuard = (href) => {
			const guard = options.beforeNavigate;
			if (!guard) return href;
			let current = href;
			for (let i = 0; i < 10; i++) {
				const result = guard(current, createHref(locationSig()));
				if (result === false) return null;
				if (typeof result === "string") {
					const next = resolveHref(result, locationSig());
					if (next === current) return current;
					current = next;
					continue;
				}
				return current;
			}
			return null;
		};
		const navigate = (target, opts) => {
			const href = applyGuard(typeof target === "string" ? resolveHref(target, locationSig()) : buildHref(target));
			if (href === null) return;
			if (opts?.force !== true && href === createHref(locationSig())) return;
			const commit = () => {
				if (opts?.replace) history.replace(href);
				else history.push(href);
			};
			if (opts?.viewTransition ?? options.viewTransitions ?? false) startViewTransition(commit);
			else commit();
		};
		const preload = (to) => {
			const href = resolveHref(to, locationSig());
			loaders.preload(matchLocation(flatMemo(), parseHref(href)));
		};
		const router = {
			state: () => stateMemo(),
			location: () => locationSig(),
			matches: () => stateMemo().matches,
			match: () => stateMemo().match,
			params: () => stateMemo().params,
			search: () => stateMemo().search,
			select: (selector, equals = Object.is) => computed(() => selector(stateMemo()), { equals }),
			navigate,
			loaderData: (match) => loaders.read(match),
			invalidate: () => loaders.invalidate(stateMemo().matches),
			preload,
			setRoutes: (routes) => routesSig.set(routes),
			routes: () => routesSig(),
			history,
			dispose
		};
		setActiveRouter(router);
		return router;
	}
	/**
	* Run `commit` inside `document.startViewTransition` when available (web only),
	* else run it directly. The signals re-render is synchronous, so it happens
	* inside the transition. No-op-wrapping outside a DOM (SSR, native, tests).
	*
	* View transitions are a progressive enhancement, so this must NEVER throw out of
	* navigate() or leak an unhandled rejection: (1) a rapid second navigation aborts
	* the first transition and rejects its eagerly-created `ready`/`updateCallbackDone`
	* promises — we mark those handled; (2) some browsers throw synchronously (e.g. a
	* hidden/background document) — we fall back to a plain commit so the navigation
	* still lands (without committing twice).
	*/
	function startViewTransition(commit) {
		const doc = typeof document === "undefined" ? void 0 : document;
		if (!doc?.startViewTransition) {
			commit();
			return;
		}
		let committed = false;
		const runCommit = () => {
			committed = true;
			commit();
		};
		try {
			const transition = doc.startViewTransition(runCommit);
			transition?.ready?.catch(() => {});
			transition?.updateCallbackDone?.catch(() => {});
		} catch {
			if (!committed) commit();
		}
	}

//#endregion
//#region ../../../../../packages/router/dist/file-routes.js
	const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/;
	function isGroup(seg) {
		return seg.startsWith("(") && seg.endsWith(")");
	}
	/** Convert one path segment to its route form (`index`→``, `[id]`→`:id`, `[...x]`→`:x*`). */
	function segmentToPath(seg) {
		if (seg === "index") return "";
		const rest = seg.match(/^\[\.\.\.(.+)\]$/);
		if (rest?.[1]) return `:${rest[1]}*`;
		const param = seg.match(/^\[(.+)\]$/);
		if (param?.[1]) return `:${param[1]}`;
		return seg;
	}
	/** Build a {@link RouteRecord} from a module, copying only the fields it defines. */
	function recordFrom(path, mod, children) {
		const record = { path };
		if (mod.default) record.component = mod.default;
		if (mod.loader) record.loader = mod.loader;
		if (mod.loaderDeps) record.loaderDeps = mod.loaderDeps;
		if (mod.searchSchema) record.searchSchema = mod.searchSchema;
		if (mod.staleTime !== void 0) record.staleTime = mod.staleTime;
		if (mod.meta) record.meta = mod.meta;
		if (children && children.length > 0) record.children = children;
		return record;
	}
	function emptyDir() {
		return {
			files: [],
			dirs: /* @__PURE__ */ new Map()
		};
	}
	/** Group the flat module map into a directory tree, pulling out a top-level not-found. */
	function buildTree(modules) {
		const root = emptyDir();
		let notFound;
		for (const rawKey of Object.keys(modules).sort()) {
			const parts = rawKey.replace(/^\.\//, "").replace(/^app\//, "").replace(ROUTE_EXT, "").split("/").filter((s) => s.length > 0);
			if (parts.length === 0) continue;
			const filename = parts[parts.length - 1];
			const mod = modules[rawKey];
			if (filename === "+not-found") {
				notFound = mod;
				continue;
			}
			let node = root;
			for (const dir of parts.slice(0, -1)) {
				let next = node.dirs.get(dir);
				if (!next) {
					next = emptyDir();
					node.dirs.set(dir, next);
				}
				node = next;
			}
			if (filename === "_layout") node.layout = mod;
			else node.files.push({
				seg: filename,
				module: mod
			});
		}
		return notFound ? {
			root,
			notFound
		} : { root };
	}
	/** Convert a directory node into the route records *relative to that node*. */
	function nodeToRoutes(node) {
		const routes = [];
		for (const file of node.files) routes.push(recordFrom(segmentToPath(file.seg), file.module));
		for (const [dirName, child] of node.dirs) {
			const childRoutes = nodeToRoutes(child);
			const seg = isGroup(dirName) ? "" : dirName;
			if (child.layout) routes.push(recordFrom(seg, child.layout, childRoutes));
			else if (seg === "") routes.push(...childRoutes);
			else routes.push({
				path: seg,
				children: childRoutes
			});
		}
		return routes;
	}
	/**
	* Build a Quantum route table ({@link RouteRecord}[]) from a file-based module map.
	* Pure — use it directly, or via {@link createFileRouter}.
	*/
	function routesFromModules(modules) {
		const { root, notFound } = buildTree(modules);
		const routes = nodeToRoutes(root);
		if (notFound?.default) routes.push({
			path: "/:__notFound*",
			component: notFound.default
		});
		return routes;
	}
	/**
	* Create a router from a file-based module map — the file-based equivalent of
	* {@link createRouter}. Pass any other router options (history, guard, …).
	*
	* @example
	* // web (Vite): const modules = import.meta.glob('./app/**\/*.tsx', { eager: true })
	* const router = createFileRouter(modules, { history: createMemoryHistory() })
	*/
	function createFileRouter(modules, options = {}) {
		return createRouter({
			...options,
			routes: routesFromModules(modules)
		});
	}

//#endregion
//#region ../../../../../packages/router/dist/hooks.js
/**
	* Ergonomic hooks + a bound `Link`, resolving the active router so components don't
	* prop-drill it — the familiar Expo Router surface (`useRouter`, `useLocalSearchParams`,
	* `<Link>`), on Quantum's fine-grained, validated core.
	*
	* The hooks return Quantum's reactive **accessors** (call them inside JSX/effects), so
	* reads stay fine-grained — only what changed re-runs (no whole-stack re-render).
	*
	* @module
	*/
	/** The active router. Throws if none has been created (call `createRouter`/`createFileRouter`). */
	function useRouter() {
		const router = getActiveRouter();
		if (!router) throw new Error("useRouter(): no active router. Create one with createRouter() or createFileRouter() first.");
		return router;
	}

//#endregion
//#region src/theme.ts
/** Shared palette + styles for the example's screens. */
	const palette = {
		screenBg: "#0b1021",
		cardBg: "#171c33",
		accent: "#5b8cff",
		accentText: "#ffffff",
		slateBg: "#2a3050",
		heading: "#e8ecff",
		muted: "#9aa4d2",
		body: "#c3cbf0"
	};
	const screenStyle = {
		flexGrow: 1,
		width: "100%",
		padding: 24,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: palette.screenBg
	};
	const cardStyle = {
		backgroundColor: palette.cardBg,
		padding: 28,
		gap: 14,
		borderRadius: 20,
		alignItems: "center",
		minWidth: 280
	};
	const headingStyle = {
		fontSize: 24,
		fontWeight: 800,
		color: palette.heading
	};
	const buttonBase = {
		color: palette.accentText,
		paddingTop: 12,
		paddingBottom: 12,
		paddingLeft: 20,
		paddingRight: 20,
		borderRadius: 12,
		fontWeight: 600
	};
	const accentButton = {
		...buttonBase,
		backgroundColor: palette.accent
	};
	const slateButton = {
		...buttonBase,
		backgroundColor: palette.slateBg
	};

//#endregion
//#region ../../../../../packages/core/dist/jsx-runtime.js
/**
	* Automatic JSX runtime for MindeesNative — the target of TypeScript's `react-jsx`
	* transform (and the same transform in esbuild/oxc/rolldown bundlers).
	*
	* Set this in `tsconfig.json` and write `<View/>` with **no manual import**:
	*
	* ```jsonc
	* { "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@mindees/core" } }
	* ```
	*
	* The compiler then injects `jsx`/`jsxs`/`Fragment` from here automatically. Both
	* delegate to {@link createElement}; the only wrinkle is that the automatic runtime
	* delivers children inside `props.children` (a single node, or an array for static
	* multi-children) — we hand them to `createElement` as positional children so arrays
	* never nest.
	*
	* @module
	*/
	function jsxImpl(type, props, key) {
		const { children, ...rest } = props ?? {};
		if (key !== void 0) rest.key = key;
		const factory = type;
		if (children === void 0) return createElement(factory, rest);
		return Array.isArray(children) ? createElement(factory, rest, ...children) : createElement(factory, rest, children);
	}
	/** JSX factory for an element with zero or one child (automatic runtime). */
	const jsx = jsxImpl;
	/** JSX factory for an element with static multiple children (automatic runtime). */
	const jsxs = jsxImpl;

//#endregion
//#region src/app/about.tsx
/**
	* About route — `app/about.tsx` maps to `/about`. Navigates back with `useRouter()`.
	*
	* @module
	*/
	var about_exports = /* @__PURE__ */ __exportAll({ default: () => About });
	function About() {
		const router = useRouter();
		return /* @__PURE__ */ jsxs(Column, {
			style: cardStyle,
			children: [
				/* @__PURE__ */ jsx(Text, {
					style: headingStyle,
					children: "About"
				}),
				/* @__PURE__ */ jsx(Text, {
					style: {
						fontSize: 15,
						color: palette.body,
						textAlign: "center",
						lineHeight: 22
					},
					children: "File-based routes (app/index.tsx, app/about.tsx) navigated by the Quantum router via the useRouter hook — all TypeScript, running native in an embedded engine."
				}),
				/* @__PURE__ */ jsx(Button, {
					title: "← Home",
					onPress: () => router.navigate("/"),
					style: accentButton
				})
			]
		});
	}

//#endregion
//#region src/app/index.tsx
/**
	* Home route — `app/index.tsx` maps to `/` (file-based routing). The default export
	* is the screen; `useRouter()` resolves the active router with no prop-drilling.
	*
	* @module
	*/
	var app_exports = /* @__PURE__ */ __exportAll({ default: () => Home });
	/** Module-scoped state survives navigation. */
	const done = signal(0);
	function Home() {
		const router = useRouter();
		const dimensions = useWindowDimensions();
		const colorScheme = useColorScheme();
		return /* @__PURE__ */ jsxs(Column, {
			style: cardStyle,
			children: [
				/* @__PURE__ */ jsx(Text, {
					style: headingStyle,
					children: "MindeesNative"
				}),
				/* @__PURE__ */ jsx(Text, {
					style: {
						fontSize: 15,
						color: palette.muted
					},
					children: "File-based routing · native · TypeScript"
				}),
				/* @__PURE__ */ jsx(Text, {
					style: {
						fontSize: 36,
						fontWeight: 800,
						color: palette.accent,
						paddingTop: 6
					},
					children: () => `Done today: ${done()}`
				}),
				/* @__PURE__ */ jsxs(Row, {
					style: {
						gap: 12,
						justifyContent: "center",
						paddingTop: 8
					},
					children: [/* @__PURE__ */ jsx(Button, {
						title: "Mark done",
						onPress: () => done.set(done() + 1),
						style: accentButton
					}), /* @__PURE__ */ jsx(Button, {
						title: "About →",
						onPress: () => router.navigate("/about"),
						style: slateButton
					})]
				}),
				/* @__PURE__ */ jsx(Text, {
					style: {
						fontSize: 13,
						color: palette.muted,
						paddingTop: 4
					},
					children: () => `Screen ${Math.round(dimensions().width)}×${Math.round(dimensions().height)} · ${colorScheme()}`
				})
			]
		});
	}

//#endregion
//#region src/routes.gen.ts
	const routes = {
		"about.tsx": about_exports,
		"index.tsx": app_exports
	};

//#endregion
//#region src/App.tsx
/**
	* The example app — file-based routing, `@mindees/*` only, plain TSX.
	*
	* Routes live in `app/` (app/index.tsx → `/`, app/about.tsx → `/about`); the screens
	* use the `useRouter()` hook (no router prop-drilling). `createFileRouter` turns the
	* module map into a Quantum router with Expo-style conventions but a stronger core
	* (validated params, fine-grained reads, codegen-free typing).
	*
	* @module
	*/
	const router = createFileRouter(routes, { history: createMemoryHistory({ initialEntries: ["/"] }) });
	/** Full-screen shell: dark background, centers the active route's card. */
	function App() {
		return /* @__PURE__ */ jsx(Column, {
			style: screenStyle,
			children: createRouterView(router)
		});
	}

//#endregion
//#region src/main.tsx
/**
	* App entry. The whole native wiring — command backend, render, flush, the
	* `MindeesApp.start()/dispatchEvent()` contract the host calls — is handled by
	* `createNativeApp`. An app author writes only this.
	*
	* @module
	*/
	const envHost = globalThis.MindeesEnv;
	if (envHost) try {
		setEnvironment(JSON.parse(envHost.get()));
	} catch {}
	createNativeApp(/* @__PURE__ */ jsx(App, {}));

//#endregion
})();