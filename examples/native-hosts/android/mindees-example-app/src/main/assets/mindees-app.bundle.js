if (typeof globalThis !== 'undefined' && typeof globalThis.queueMicrotask !== 'function') { globalThis.queueMicrotask = function (cb) { Promise.resolve().then(cb); }; }
(function() {


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
//#region \0@oxc-project+runtime@0.133.0/helpers/esm/typeof.js
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}

//#endregion
//#region \0@oxc-project+runtime@0.133.0/helpers/esm/toPrimitive.js
	function toPrimitive(t, r) {
		if ("object" != _typeof(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}

//#endregion
//#region \0@oxc-project+runtime@0.133.0/helpers/esm/toPropertyKey.js
	function toPropertyKey(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}

//#endregion
//#region \0@oxc-project+runtime@0.133.0/helpers/esm/defineProperty.js
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
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
			_defineProperty(this, "value", void 0);
			_defineProperty(this, "fn", void 0);
			_defineProperty(this, "state", void 0);
			_defineProperty(this, "sources", null);
			_defineProperty(this, "observers", null);
			_defineProperty(this, "owned", null);
			_defineProperty(this, "cleanups", null);
			_defineProperty(this, "equals", void 0);
			_defineProperty(this, "isEffect", void 0);
			_defineProperty(
				this,
				/**
				* Whether {@link value} holds a real computed result yet. Derivations start
				* uninitialized (their initial `value` is a placeholder); the first
				* computation must NOT call `equals(oldValue, …)` against that placeholder —
				* a custom comparator would receive `undefined` and could throw.
				*/
				"initialized",
				void 0
			);
			_defineProperty(
				this,
				/**
				* True only while this node's own {@link update} is on the stack. Lets
				* {@link markStale} recognize a *self-write* — the body writing a signal the
				* node observes — instead of dropping the mark (the node is already DIRTY).
				*/
				"running",
				false
			);
			_defineProperty(
				this,
				/**
				* Set by {@link markStale} when a self-write occurs mid-update. {@link update}'s
				* loop recomputes once more so the node converges on the value it just produced,
				* honoring the contract that a computation reflects its dependencies' latest
				* values. Reset at the start of every pass.
				*/
				"restaleRequested",
				false
			);
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
//#region src/main.ts
/**
	* The example app's **real** UI — @mindees/core signals + @mindees/atlas primitives
	* driven by the @mindees/renderer (Helix) reconciler.
	*
	* Unlike a hand-written command script, this exercises the genuine pipeline: the
	* reconciler renders Atlas components against a {@link createNativeCommandBackend},
	* which emits the serializable {@link NativeCommand} stream the native host
	* (`MindeesNativeHost` + `AndroidViewRenderer`) materializes into real Android views.
	* State changes (a signal `set` from a button press) re-run the reconciler
	* synchronously, producing a minimal `updateText` batch — no full re-render.
	*
	* Bundled to a QuickJS-safe IIFE (see ../tsdown.config.ts) and loaded from the
	* app's assets. Regenerate with `pnpm run build:android-example-js` from the repo root.
	*
	* @module
	*/
	const backend = createNativeCommandBackend({ rootId: "host-root" });
	/** Send any buffered commands to the native host as one JSON batch. */
	function flush() {
		const batch = backend.flushCommands();
		if (batch.length > 0) MindeesHost.emit(JSON.stringify(batch));
	}
	const count = signal(0);
	const palette = {
		screenBg: "#0b1021",
		cardBg: "#171c33",
		accent: "#5b8cff",
		accentText: "#ffffff",
		resetBg: "#2a3050",
		heading: "#e8ecff",
		muted: "#9aa4d2"
	};
	/** The root component — a centered card with a heading, a live counter, and two buttons. */
	function App() {
		return createElement(Column, { style: {
			padding: 24,
			gap: 20,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: palette.screenBg,
			flexGrow: 1
		} }, createElement(Column, { style: {
			backgroundColor: palette.cardBg,
			padding: 28,
			gap: 14,
			borderRadius: 20,
			alignItems: "center",
			minWidth: 260
		} }, createElement(Text, { style: {
			fontSize: 22,
			fontWeight: 700,
			color: palette.heading
		} }, "MindeesNative"), createElement(Text, { style: {
			fontSize: 15,
			color: palette.muted
		} }, "Real Atlas + Helix, rendered native"), createElement(Text, { style: {
			fontSize: 40,
			fontWeight: 800,
			color: palette.accent,
			paddingTop: 8
		} }, () => `Count: ${count()}`), createElement(Row, { style: {
			gap: 12,
			justifyContent: "center",
			paddingTop: 8
		} }, createElement(Button, {
			title: "Increment",
			onPress: () => count.set(count() + 1),
			style: {
				backgroundColor: palette.accent,
				color: palette.accentText,
				paddingTop: 12,
				paddingBottom: 12,
				paddingLeft: 20,
				paddingRight: 20,
				borderRadius: 12,
				fontWeight: 600
			}
		}), createElement(Button, {
			title: "Reset",
			onPress: () => count.set(0),
			style: {
				backgroundColor: palette.resetBg,
				color: palette.accentText,
				paddingTop: 12,
				paddingBottom: 12,
				paddingLeft: 20,
				paddingRight: 20,
				borderRadius: 12,
				fontWeight: 600
			}
		}))));
	}
	globalThis.MindeesApp = {
		start() {
			render(createElement(App, null), backend, backend.root);
			flush();
		},
		dispatchEvent(handlerId) {
			backend.dispatchEvent(handlerId);
			flush();
		}
	};

//#endregion
})();