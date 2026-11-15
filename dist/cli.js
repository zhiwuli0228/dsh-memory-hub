#!/usr/bin/env node
import { createRequire as __dshMemoryHubCreateRequire } from 'node:module'
const require = __dshMemoryHubCreateRequire(import.meta.url)
// dsh-memory-hub 0.8.0
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid2 = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid2);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header2 = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header2 += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header2}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header2}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep3, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep3) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep3 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep3 + cb;
              sep3 = "";
              break;
            }
            case "newline":
              if (comment)
                sep3 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep3, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep3 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep3 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep3, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep3 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep3)
                for (const st of sep3) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header2 = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header2)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header2.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header2.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header2.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header2.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header2.indent;
      let offset = scalar.offset + header2.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header2.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header2.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep3 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header2.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep3 === " ")
            sep3 = "\n";
          else if (!prevMoreIndented && sep3 === "\n")
            sep3 = "\n\n";
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep3 === "\n")
            value += "\n";
          else
            sep3 = "\n";
        } else {
          value += sep3 + content;
          sep3 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header2.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header2.length + scalar.source.length;
      return { value, type, comment: header2.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep3 = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep3 === "\n")
            res += sep3;
          else
            sep3 = "\n";
        } else {
          res += sep3 + lm;
          sep3 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep3 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header2 = token.props[0];
            if (header2.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header2.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header2 = token.props[0];
        if (header2.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header2.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep3, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep3)
        for (const st of sep3)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep3;
          if (scalar.end) {
            sep3 = scalar.end;
            sep3.push(this.sourceToken);
            delete scalar.end;
          } else
            sep3 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep3 = it.sep;
                  sep3.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep3 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep3 = fc.end.splice(1, fc.end.length);
            sep3.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep3 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
import { join as join13 } from "node:path";
import { homedir as homedir3 } from "node:os";

// package.json
var package_default = {
  name: "dsh-memory-hub",
  version: "0.8.0",
  description: "Local-first, file-native long-term memory hub: preflight, compact context injection, citations, human-approved commits, temporal validity, dedupe/merge, retrospective reflection, write-risk flags, a derived SQLite index, per-workspace scheduled distillation, and a Web panel with human review. Ships as a DSH plugin and as a standalone MCP server / CLI (`memory-hub`) for cross-host use.",
  license: "MIT",
  author: "zhiwuli0228",
  homepage: "https://github.com/zhiwuli0228/dsh-memory-hub#readme",
  repository: {
    type: "git",
    url: "git+https://github.com/zhiwuli0228/dsh-memory-hub.git"
  },
  bugs: {
    url: "https://github.com/zhiwuli0228/dsh-memory-hub/issues"
  },
  type: "module",
  main: "dist/index.js",
  bin: {
    "memory-hub": "dist/cli.js"
  },
  exports: {
    ".": "./dist/index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg",
    "./package.json": "./package.json"
  },
  files: [
    "dist/index.js",
    "dist/cli.js",
    "client.js",
    "cordis.patch.yml",
    "locale/*.json",
    "icon.svg",
    "README.md",
    "LICENSE",
    "docs/*.md",
    "docs/02-harness/*.md"
  ],
  engines: {
    node: ">=20",
    dsh: ">=0.2.1-rc.5"
  },
  publishConfig: {
    access: "public"
  },
  scripts: {
    build: "node esbuild.config.mjs",
    typecheck: "tsc --noEmit",
    test: "vitest run",
    "test:watch": "vitest",
    check: "npm run typecheck && npm run build && npm run test"
  },
  keywords: [
    "deepseek-harness",
    "dsh",
    "dsh-plugin",
    "memory",
    "long-term-memory",
    "knowledge-base",
    "mcp",
    "mcp-server",
    "claude-code"
  ],
  dsh: {
    manifestVersion: 1,
    bundle: {
      patch: "./cordis.patch.yml"
    },
    client: {
      platform: "web",
      immediately: true,
      inject: [
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-sidebar"
      ]
    }
  },
  devDependencies: {
    "@types/node": "^24.3.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    esbuild: "^0.25.9",
    react: "^19.3.1",
    "react-dom": "^19.3.1",
    typescript: "^5.9.2",
    vitest: "^3.2.4",
    yaml: "^2.8.1",
    zod: "^3.25.76"
  }
};

// src/version.ts
var PACKAGE_VERSION = package_default.version;

// src/transport/mcp.ts
import { createInterface } from "node:readline";

// src/errors.ts
var MemoryError = class extends Error {
  code;
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = "MemoryError";
    this.code = code;
  }
};

// src/types.ts
var KNOWLEDGE_TYPES = [
  "decision",
  "constraint",
  "knowledge",
  "api-catalog",
  "process",
  "open-questions",
  "runtime-base",
  "playbooks",
  "assets"
];
var TYPE_PREFIX = {
  decision: "DEC",
  constraint: "CON",
  knowledge: "KNO",
  "api-catalog": "API",
  process: "PRC",
  "open-questions": "OQ",
  "runtime-base": "RUN",
  playbooks: "PLAY",
  assets: "AST"
};
var PREFIX_TYPE = Object.fromEntries(
  Object.entries(TYPE_PREFIX).map(([type, prefix]) => [prefix, type])
);
var KNOWLEDGE_STATUSES = [
  "candidate",
  "accepted",
  "rejected",
  "superseded",
  "deprecated"
];

// src/scope.ts
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function isScopeId(value) {
  return ID_PATTERN.test(value);
}
function parseScope(value) {
  if (value === "global") return { level: "global" };
  const [level, id] = value.split(":", 2);
  if ((level === "domain" || level === "project") && id !== void 0 && isScopeId(id)) {
    return level === "domain" ? { level: "domain", id } : { level: "project", workspaceId: id };
  }
  throw new MemoryError("INVALID_INPUT", `invalid scope "${value}" (expected global, domain:<id>, or project:<workspace-id>)`);
}
function formatScope(scope) {
  switch (scope.level) {
    case "global":
      return "global";
    case "domain":
      return `domain:${scope.id}`;
    case "project":
      return `project:${scope.workspaceId}`;
  }
}
function visibilityFor(workspaceId, domains, coreWorkspaceIds = []) {
  const projects = new Set(coreWorkspaceIds);
  if (workspaceId !== null) projects.add(workspaceId);
  return { global: true, domains: new Set(domains), projects };
}
function isScopeVisible(scope, visibility) {
  switch (scope.level) {
    case "global":
      return visibility.global;
    case "domain":
      return visibility.domains.has(scope.id);
    case "project":
      return visibility.projects.has(scope.workspaceId);
  }
}

// src/tools.ts
function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    ...required.length === 0 ? {} : { required },
    additionalProperties: false
  };
}
var knowledgeTypesSchema = {
  type: "array",
  items: { type: "string", enum: [...KNOWLEDGE_TYPES] },
  description: "Optional knowledge type filter."
};
var knowledgeStatusesSchema = {
  type: "array",
  items: { type: "string", enum: [...KNOWLEDGE_STATUSES] },
  description: "Optional status filter; defaults to accepted."
};
var assessmentSchema = objectSchema(
  {
    kind: {
      type: "string",
      enum: ["proposed", "no_new_knowledge", "needs_evidence", "deferred"],
      description: "Assessment kind."
    },
    proposal_ids: {
      type: "array",
      items: { type: "string" },
      description: "Pending proposal ids created by this task (proposed only)."
    },
    reason: { type: "string", description: "Reason for no_new_knowledge or deferred." },
    missing: {
      type: "array",
      items: { type: "string" },
      description: "Missing evidence items (needs_evidence only)."
    }
  },
  ["kind"]
);
function normalizeAssessment(raw) {
  if (raw === null || typeof raw !== "object") {
    throw new MemoryError("INVALID_INPUT", "assessment must be an object");
  }
  const value = raw;
  const kind = value.kind;
  if (kind === "proposed") {
    const ids = Array.isArray(value.proposal_ids) ? value.proposal_ids.filter((id) => typeof id === "string") : [];
    return { kind, proposalIds: ids };
  }
  if (kind === "no_new_knowledge") {
    return { kind, reason: typeof value.reason === "string" ? value.reason : "" };
  }
  if (kind === "needs_evidence") {
    const missing = Array.isArray(value.missing) ? value.missing.filter((item) => typeof item === "string") : [];
    return { kind, missing };
  }
  if (kind === "deferred") {
    return { kind, reason: typeof value.reason === "string" ? value.reason : "" };
  }
  throw new MemoryError("INVALID_INPUT", "assessment.kind must be proposed, no_new_knowledge, needs_evidence, or deferred");
}

// src/transport/hub-handle.ts
import { basename as basename5, isAbsolute as isAbsolute2, join as join10, resolve as resolve2 } from "node:path";

// src/hub.ts
import { homedir } from "node:os";
import { join as join4, resolve } from "node:path";

// src/atomic.ts
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// src/ids.ts
import { randomBytes } from "node:crypto";

// src/time.ts
var ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isIsoTimestamp(value) {
  return ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}
function dateStamp(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
function sleep(ms) {
  return new Promise((resolve5) => setTimeout(resolve5, ms));
}

// src/ids.ts
function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}
function newTaskId() {
  return `TSK-${dateStamp()}-${randomHex(3)}`;
}
function newPreflightId() {
  return `PF-${randomHex(4)}`;
}
function newMaintenanceTaskId() {
  return `MAINT-${dateStamp()}-${randomHex(3)}`;
}
function newCitationId() {
  return `CIT-${randomHex(6)}`;
}
function formatSequence(value, width = 6) {
  return String(value).padStart(width, "0");
}

// src/atomic.ts
async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}
async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeAtomic(path, content) {
  const dir = dirname(path);
  await ensureDir(dir);
  const temp = join(dir, `.${basename(path)}.${process.pid}.${randomHex(4)}.tmp`);
  const handle = await open(temp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temp, path);
      return;
    } catch (error) {
      lastError = error;
      const code = error.code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") break;
      await sleep(50 * 2 ** attempt);
    }
  }
  await rm(temp, { force: true }).catch(() => {
  });
  throw new Error(`cannot replace ${path}: ${lastError?.message ?? "unknown error"}`);
}
async function removeFile(path) {
  await rm(path, { force: true });
}

// src/config.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFile as readFile2 } from "node:fs/promises";

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header2] = jwt.split(".");
    if (!header2)
      return false;
    const base64 = header2.replace(/-/g, "+").replace(/_/g, "/").padEnd(header2.length + (4 - header2.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/tencent-client.ts
var TencentError = class extends Error {
  status;
  code;
  constructor(message, options = {}) {
    super(message);
    this.name = "TencentError";
    this.status = options.status ?? null;
    this.code = options.code ?? "TENCENT_ERROR";
  }
};
var DEFAULT_TIMEOUT_MS = 1e4;
var TencentClient = class {
  config;
  fetchImpl;
  constructor(options) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }
  get baseUrl() {
    return this.config.url.replace(/\/+$/, "");
  }
  isolation(extra = {}) {
    return {
      team_id: this.config.teamId,
      ...this.config.agentId === "" ? {} : { agent_id: this.config.agentId },
      ...this.config.userId === "" ? {} : { user_id: this.config.userId },
      ...this.config.taskId === "" ? {} : { task_id: this.config.taskId },
      ...extra
    };
  }
  async post(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "x-tdai-service-id": this.config.serviceId
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let envelope = null;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new TencentError(`tencent ${path}: non-JSON response (${response.status})`, { status: response.status });
      }
      if (!response.ok) {
        const message = typeof envelope?.message === "string" ? envelope.message : `HTTP ${response.status}`;
        throw new TencentError(`tencent ${path}: ${message}`, { status: response.status, code: envelope?.code === void 0 ? "HTTP_ERROR" : String(envelope.code) });
      }
      if (envelope === null || envelope.code !== 0) {
        throw new TencentError(`tencent ${path}: code ${envelope?.code ?? "null"} ${envelope?.message ?? ""}`.trim(), {
          status: response.status,
          code: String(envelope?.code ?? "BIZ_ERROR")
        });
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof TencentError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new TencentError(`tencent ${path}: timeout after ${this.config.timeoutMs}ms`, { code: "TIMEOUT" });
      }
      throw new TencentError(`tencent ${path}: ${error.message}`, { code: "NETWORK_ERROR" });
    } finally {
      clearTimeout(timeout);
    }
  }
  /** 只读连通性：拉取 L1 计数。失败说明配置/网络有问题。 */
  async ping() {
    return this.post("/v3/atomic/count", this.isolation());
  }
  /** 按语义/关键词检索 L1 原子记忆。 */
  async searchAtomics(query, limit = 10) {
    const data = await this.post(
      "/v3/atomic/search",
      this.isolation({ query, limit })
    );
    return Array.isArray(data.items) ? data.items : [];
  }
  /** 列出 L1 原子记忆（无 query 时按时间倒序）。 */
  async listAtomics(limit = 50) {
    const data = await this.post(
      "/v3/atomic/query",
      this.isolation({ limit })
    );
    return Array.isArray(data.items) ? data.items : [];
  }
  /** 列出 L2 场景文件。 */
  async listScenarios() {
    const data = await this.post(
      "/v3/scenario/ls",
      this.isolation()
    );
    return Array.isArray(data.entries) ? data.entries : [];
  }
  /** 读取 L2 场景文件全文。 */
  async readScenario(path) {
    const data = await this.post("/v3/scenario/read", this.isolation({ path }));
    return typeof data.content === "string" ? data.content : "";
  }
  /** 追加一条 conversation 消息（腾讯侧异步抽取为 L1）。 */
  async addConversation(sessionId, role, content) {
    return this.post(
      "/v3/conversation/add",
      this.isolation({ session_id: sessionId, messages: [{ role, content }] })
    );
  }
  /** 读取 L0 会话消息。 */
  async queryConversation(sessionId, limit = 20) {
    return this.post("/v3/conversation/query", this.isolation({ session_id: sessionId, limit }));
  }
};

// src/remote/types.ts
var REMOTE_ROLES = ["feed", "mirror", "authority", "index"];
var REMOTE_CAPABILITIES = [
  "read.list",
  "read.search",
  "read.get",
  "write.append",
  "write.upsert",
  "write.delete",
  "scope",
  "changes",
  "realtime",
  "extract",
  "idempotent"
];
var RemoteError = class extends Error {
  kind;
  providerId;
  constructor(providerId, kind, message) {
    super(`[remote:${providerId}:${kind}] ${message}`);
    this.name = "RemoteError";
    this.providerId = providerId;
    this.kind = kind;
  }
  /** 只有网络/超时类值得重试；其它重试只会浪费配额并拖长故障时间。 */
  get retryable() {
    return this.kind === "unreachable";
  }
};
function remoteError(providerId, kind, message) {
  throw new RemoteError(providerId, kind, message);
}
function isRemoteError(error) {
  return error instanceof RemoteError;
}
function hasCapability(adapter, capability) {
  return adapter.capabilities().has(capability);
}
function requireCapability(adapter, capability) {
  if (!hasCapability(adapter, capability)) {
    remoteError(
      adapter.id,
      "unsupported",
      `provider "${adapter.id}" (${adapter.kind}) does not declare capability "${capability}"`
    );
  }
}
function requireMethod(adapter, method) {
  const capability = METHOD_CAPABILITY[method];
  requireCapability(adapter, capability);
  const fn = adapter[method];
  if (typeof fn !== "function") {
    remoteError(
      adapter.id,
      "unsupported",
      `provider "${adapter.id}" declares "${capability}" but does not implement "${method}()"`
    );
  }
  return fn.bind(adapter);
}
var METHOD_CAPABILITY = {
  list: "read.list",
  search: "read.search",
  get: "read.get",
  append: "write.append",
  upsert: "write.upsert",
  delete: "write.delete",
  changesSince: "changes"
};

// src/remote/http-json-adapter.ts
var CAPABILITY_SET = new Set(REMOTE_CAPABILITIES);
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readString(value) {
  return typeof value === "string" && value !== "" ? value : void 0;
}
function parseEndpoint(raw, name, errors) {
  if (raw === void 0) return void 0;
  const record = asRecord(raw);
  const method = readString(record.method)?.toUpperCase() ?? "POST";
  const path = readString(record.path);
  if (path === void 0) {
    errors.push(`endpoints.${name}.path is required`);
    return void 0;
  }
  if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    errors.push(`endpoints.${name}.method "${method}" is not one of GET/POST/PUT/PATCH/DELETE`);
    return void 0;
  }
  return {
    method,
    path,
    ...record.body === void 0 ? {} : { body: asRecord(record.body) },
    ...record.query === void 0 ? {} : { query: asRecord(record.query) }
  };
}
function parseMapping(raw, errors) {
  if (raw === void 0) {
    errors.push("mapping is required when any read endpoint is declared");
    return void 0;
  }
  const record = asRecord(raw);
  const items = readString(record.items);
  const id = readString(record.id);
  if (items === void 0 || id === void 0) {
    errors.push("mapping.items and mapping.id are required");
    return void 0;
  }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && !value.startsWith("$")) {
      errors.push(`mapping.${key} must be a "$." path (got "${value}")`);
    }
  }
  return {
    items,
    id,
    ...record.external_id === void 0 ? {} : { external_id: readString(record.external_id) },
    ...record.title === void 0 ? {} : { title: readString(record.title) },
    ...record.summary === void 0 ? {} : { summary: readString(record.summary) },
    ...record.body === void 0 ? {} : { body: readString(record.body) },
    ...record.scope === void 0 ? {} : { scope: readString(record.scope) },
    ...record.tags === void 0 ? {} : { tags: readString(record.tags) },
    ...record.updated_at === void 0 ? {} : { updated_at: readString(record.updated_at) },
    ...record.version === void 0 ? {} : { version: readString(record.version) },
    ...record.next_cursor === void 0 ? {} : { next_cursor: readString(record.next_cursor) },
    ...record.total === void 0 ? {} : { total: readString(record.total) }
  };
}
function parseHttpJsonSettings(config) {
  const errors = [];
  const baseUrl = readString(config.base_url);
  if (baseUrl === void 0) {
    errors.push("base_url is required");
  } else {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push(`base_url must be http/https (got "${url.protocol}")`);
      }
    } catch {
      errors.push(`base_url is not a valid URL: "${baseUrl}"`);
    }
  }
  const rawCapabilities = Array.isArray(config.capabilities) ? config.capabilities : [];
  if (rawCapabilities.length === 0) {
    errors.push("capabilities is required and must be a non-empty list (declare exactly what the service supports)");
  }
  const capabilities = [];
  for (const entry of rawCapabilities) {
    if (typeof entry !== "string" || !CAPABILITY_SET.has(entry)) {
      errors.push(`capabilities contains unknown entry "${String(entry)}" (known: ${[...CAPABILITY_SET].join(", ")})`);
      continue;
    }
    capabilities.push(entry);
  }
  const endpoints = {};
  const endpointRecord = asRecord(config.endpoints);
  const list = parseEndpoint(endpointRecord.list, "list", errors);
  const search = parseEndpoint(endpointRecord.search, "search", errors);
  const append = parseEndpoint(endpointRecord.append, "append", errors);
  if (list !== void 0) endpoints.list = list;
  if (search !== void 0) endpoints.search = search;
  if (append !== void 0) endpoints.append = append;
  if (endpoints.list === void 0 && endpoints.search === void 0 && endpoints.append === void 0) {
    errors.push("at least one of endpoints.list / endpoints.search / endpoints.append is required");
  }
  let mapping;
  if (endpoints.list !== void 0 || endpoints.search !== void 0) {
    mapping = parseMapping(config.mapping, errors);
  } else {
    const record = asRecord(config.mapping);
    mapping = { items: "$", id: "$.id", ...record.external_id === void 0 ? {} : { external_id: readString(record.external_id) } };
  }
  const authRecord = asRecord(config.auth);
  let auth = null;
  if (authRecord.type !== void 0) {
    const type = readString(authRecord.type);
    const tokenEnv = readString(authRecord.token_env);
    if (type !== "bearer" && type !== "header") {
      errors.push(`auth.type must be "bearer" or "header" (got "${String(authRecord.type)}")`);
    } else if (tokenEnv === void 0) {
      errors.push("auth.token_env is required (never put the token itself in config.yaml)");
    } else {
      auth = { type, token_env: tokenEnv, ...readString(authRecord.name) === void 0 ? {} : { name: readString(authRecord.name) } };
    }
  }
  const headers = {};
  for (const [key, value] of Object.entries(asRecord(config.headers))) {
    if (typeof value === "string") headers[key] = value;
  }
  const timeoutRaw = config.timeout_ms;
  const timeoutMs = typeof timeoutRaw === "number" && Number.isInteger(timeoutRaw) && timeoutRaw >= 100 && timeoutRaw <= 12e4 ? timeoutRaw : 1e4;
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      base_url: baseUrl,
      auth,
      headers,
      timeout_ms: timeoutMs,
      endpoints,
      mapping,
      capabilities
    }
  };
}
var VAR_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
function stringifyValue(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function interpolate(value, vars) {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/);
    if (exact !== null) {
      const name = exact[1];
      return name in vars ? vars[name] : null;
    }
    return value.replace(VAR_PATTERN, (_match, name) => stringifyValue(vars[name]));
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, vars));
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) result[key] = interpolate(entry, vars);
    return result;
  }
  return value;
}
function lookup(root, path) {
  if (path === "$" || path === "") return root;
  if (!path.startsWith("$.")) return void 0;
  let cursor = root;
  for (const segment of path.slice(2).split(".")) {
    if (cursor === null || typeof cursor !== "object") return void 0;
    cursor = cursor[segment];
  }
  return cursor;
}
function statusErrorKind(status) {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 409 || status === 412) return "conflict";
  if (status >= 500) return "unreachable";
  return "invalid";
}
var HttpJsonAdapter = class {
  id;
  kind = "http-json";
  settings;
  resolveToken;
  fetchImpl;
  constructor(options) {
    this.id = options.id;
    this.settings = options.settings;
    this.resolveToken = options.resolveToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }
  capabilities() {
    return new Set(this.settings.capabilities);
  }
  async probe() {
    const startedAt = Date.now();
    try {
      if (this.settings.endpoints.list !== void 0) {
        const response2 = await this.request(this.settings.endpoints.list, { limit: 1, scope: null });
        const page = this.toPage(response2);
        return { ok: true, latencyMs: Date.now() - startedAt, detail: `${page.items.length} item(s)` };
      }
      const response = await this.rawRequest(this.settings.base_url, { method: "GET" });
      return {
        ok: response.status < 500,
        latencyMs: Date.now() - startedAt,
        detail: response.status < 500 ? `root responded ${response.status}` : `root responded ${response.status}`
      };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - startedAt, detail: error.message };
    }
  }
  async list(q) {
    const spec = this.settings.endpoints.list;
    if (spec === void 0) {
      remoteError(this.id, "unsupported", 'capability "read.list" is declared but endpoints.list is not configured');
    }
    const response = await this.request(spec, {
      limit: q.limit,
      ...q.cursor === void 0 ? {} : { cursor: q.cursor },
      ...q.scope === void 0 ? {} : { scope: q.scope }
    });
    return this.toPage(response);
  }
  async search(q) {
    const spec = this.settings.endpoints.search;
    if (spec === void 0) {
      remoteError(this.id, "unsupported", 'capability "read.search" is declared but endpoints.search is not configured');
    }
    if (typeof q.text !== "string" || q.text.trim() === "") {
      remoteError(this.id, "invalid", "http-json search requires a non-empty `text`");
    }
    const response = await this.request(spec, {
      text: q.text,
      limit: q.limit,
      ...q.cursor === void 0 ? {} : { cursor: q.cursor },
      ...q.scope === void 0 ? {} : { scope: q.scope }
    });
    return this.toPage(response);
  }
  async append(rec, opts) {
    const spec = this.settings.endpoints.append;
    if (spec === void 0) {
      remoteError(this.id, "unsupported", 'capability "write.append" is declared but endpoints.append is not configured');
    }
    const response = await this.request(spec, {
      id: rec.externalId,
      title: rec.title,
      summary: rec.summary,
      body: rec.body,
      ...rec.scope === void 0 ? {} : { scope: rec.scope },
      tags: rec.tags,
      ...rec.updatedAt === void 0 ? {} : { updated_at: rec.updatedAt },
      ...rec.version === void 0 ? {} : { version: rec.version },
      idempotency_key: opts.idempotencyKey
    });
    const externalId = lookup(response, this.settings.mapping.external_id ?? this.settings.mapping.id);
    return {
      // 响应没给 id 时回退幂等键：engine 的 externalIds 台账仍然可用（对无删除能力的
      // 服务这只影响台账展示；真有 delete 能力的服务应返回真实 id）。
      externalId: typeof externalId === "string" && externalId !== "" ? externalId : opts.idempotencyKey
    };
  }
  /* ---------------- 内部 ---------------- */
  authHeaders() {
    const auth = this.settings.auth;
    if (auth === null) return {};
    const token = this.resolveToken();
    if (token === "") return {};
    return auth.type === "bearer" ? { authorization: `Bearer ${token}` } : { [auth.name ?? "x-api-key"]: token };
  }
  async request(spec, vars) {
    const base = this.settings.base_url.replace(/\/+$/, "");
    const path = spec.path.startsWith("/") ? spec.path : `/${spec.path}`;
    const url = new URL(`${base}${path}`);
    if (spec.query !== void 0) {
      const query = interpolate(spec.query, vars);
      for (const [key, value] of Object.entries(asRecord(query))) {
        if (value !== null && value !== void 0 && value !== "") url.searchParams.set(key, stringifyValue(value));
      }
    }
    const headers = { ...this.settings.headers, ...this.authHeaders() };
    const method = spec.method;
    let body;
    if (method !== "GET" && method !== "DELETE" && spec.body !== void 0) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(interpolate(spec.body, vars));
    }
    const response = await this.rawRequest(url.toString(), {
      method,
      headers,
      ...body === void 0 ? {} : { body },
      signal: AbortSignal.timeout(this.settings.timeout_ms)
    });
    const text = await response.text();
    if (response.status >= 400) {
      const snippet = text.slice(0, 200);
      throw new RemoteError(this.id, statusErrorKind(response.status), `HTTP ${response.status}: ${snippet}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new RemoteError(this.id, "invalid", `HTTP ${response.status} with non-JSON body: ${text.slice(0, 120)}`);
    }
  }
  async rawRequest(url, init) {
    try {
      return await this.fetchImpl(url, init);
    } catch (error) {
      const message = error?.message ?? String(error);
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      throw new RemoteError(this.id, "unreachable", isTimeout ? `request timed out: ${url}` : message);
    }
  }
  /** 响应 → 统一分页。缺 id 的条目丢弃（远端噪声不应阻塞整条流水线）。 */
  toPage(response) {
    const mapping = this.settings.mapping;
    const rawItems = lookup(response, mapping.items);
    if (!Array.isArray(rawItems)) {
      remoteError(this.id, "invalid", `mapping.items "${mapping.items}" did not resolve to an array`);
    }
    const items = [];
    for (const raw of rawItems) {
      const externalId = lookup(raw, mapping.id);
      if (typeof externalId !== "string" || externalId === "") continue;
      const body = readStringAt(raw, mapping.body);
      const summary = readStringAt(raw, mapping.summary) ?? truncate(body ?? "", 240);
      const title = readStringAt(raw, mapping.title) ?? truncate(summary, 60);
      const tagsRaw = mapping.tags === void 0 ? void 0 : lookup(raw, mapping.tags);
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((tag) => typeof tag === "string") : typeof tagsRaw === "string" && tagsRaw !== "" ? tagsRaw.split(",").map((tag) => tag.trim()).filter((tag) => tag !== "") : [];
      const scope = readStringAt(raw, mapping.scope);
      const updatedAt = readStringAt(raw, mapping.updated_at);
      const version = readStringAt(raw, mapping.version);
      items.push({
        externalId,
        title,
        summary,
        body: body ?? "",
        tags,
        ...scope === void 0 ? {} : { scope },
        ...updatedAt === void 0 ? {} : { updatedAt },
        ...version === void 0 ? {} : { version },
        raw
      });
    }
    const nextCursor = mapping.next_cursor === void 0 ? void 0 : readStringAt(response, mapping.next_cursor);
    const total = mapping.total === void 0 ? void 0 : lookup(response, mapping.total);
    return {
      items,
      ...nextCursor === void 0 ? {} : { cursor: nextCursor },
      ...typeof total === "number" ? { total } : {}
    };
  }
};
function readStringAt(root, path) {
  if (path === void 0) return void 0;
  const value = lookup(root, path);
  return typeof value === "string" && value !== "" ? value : void 0;
}
function truncate(text, max) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}\u2026` : trimmed;
}
var httpJsonAdapterFactory = (ctx) => {
  const parsed = parseHttpJsonSettings(ctx.config);
  if (!parsed.ok) {
    throw new Error(`invalid http-json config: ${parsed.errors.join("; ")}`);
  }
  const token = parsed.settings.auth === null ? "" : ctx.resolveSecret(parsed.settings.auth.token_env);
  if (parsed.settings.auth !== null && token === "") {
    throw new Error(
      `auth token env ${parsed.settings.auth.token_env} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs)`
    );
  }
  return new HttpJsonAdapter({
    id: ctx.providerId,
    settings: parsed.settings,
    resolveToken: () => parsed.settings.auth === null ? "" : ctx.resolveSecret(parsed.settings.auth.token_env),
    ...ctx.fetchImpl === void 0 ? {} : { fetchImpl: ctx.fetchImpl }
  });
};

// src/remote/tencent-adapter.ts
var CAPABILITIES = /* @__PURE__ */ new Set([
  "read.list",
  "read.search",
  "write.append",
  "extract"
]);
function mapError(providerId, error) {
  if (error instanceof RemoteError) return error;
  if (!(error instanceof TencentError)) {
    return new RemoteError(providerId, "unreachable", error?.message ?? String(error));
  }
  if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
    return new RemoteError(providerId, "unreachable", error.message);
  }
  const status = error.status ?? 0;
  if (status === 401 || status === 403) {
    return new RemoteError(providerId, "unauthorized", error.message);
  }
  if (status === 409 || status === 412) {
    return new RemoteError(providerId, "conflict", error.message);
  }
  if (status >= 500) {
    return new RemoteError(providerId, "unreachable", error.message);
  }
  return new RemoteError(providerId, "invalid", error.message);
}
function toRecord(item) {
  const summary = typeof item.content === "string" ? item.content.replace(/\s+/g, " ").trim() : "";
  const title = summary.length > 60 ? `${summary.slice(0, 60)}\u2026` : summary;
  return {
    externalId: item.id,
    title,
    summary: summary.length > 240 ? `${summary.slice(0, 240)}\u2026` : summary,
    body: typeof item.content === "string" ? item.content : "",
    tags: typeof item.type === "string" && item.type !== "" ? [item.type] : [],
    ...item.updated_at === void 0 ? {} : { updatedAt: item.updated_at },
    raw: item
  };
}
var TencentAdapter = class {
  id;
  kind = "tencent";
  client;
  constructor(options) {
    this.id = options.id;
    this.client = options.client;
  }
  capabilities() {
    return CAPABILITIES;
  }
  async probe() {
    const startedAt = Date.now();
    try {
      const { total } = await this.client.ping();
      return { ok: true, latencyMs: Date.now() - startedAt, detail: `${total} atomics` };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - startedAt, detail: error.message };
    }
  }
  async list(q) {
    try {
      const items = await this.client.listAtomics(q.limit);
      return { items: items.map(toRecord), total: items.length };
    } catch (error) {
      throw mapError(this.id, error);
    }
  }
  async search(q) {
    if (typeof q.text !== "string" || q.text.trim() === "") {
      remoteError(this.id, "invalid", "tencent search requires a non-empty `text`");
    }
    try {
      const items = await this.client.searchAtomics(q.text, q.limit);
      return { items: items.map(toRecord), total: items.length };
    } catch (error) {
      throw mapError(this.id, error);
    }
  }
  async append(rec, opts) {
    try {
      const sessionId = `dsh-memory-hub:${opts.idempotencyKey}`;
      const payload = [rec.title, rec.summary, rec.body].filter((part) => part !== "").join("\n\n");
      await this.client.addConversation(sessionId, "user", payload);
      return { externalId: sessionId };
    } catch (error) {
      throw mapError(this.id, error);
    }
  }
};

// src/remote/registry.ts
var REMOTE_MODES = ["local-first", "hybrid", "remote-authority"];
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item !== "");
}
function readString2(value, fallback) {
  return typeof value === "string" && value !== "" ? value : fallback;
}
function readBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function readInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}
function readRoles(value) {
  const allowed = new Set(REMOTE_ROLES);
  const roles = readStringArray(value).filter((role) => allowed.has(role));
  return [...new Set(roles)];
}
function normalizeProvider(raw, index) {
  const record = asRecord2(raw);
  const projection = asRecord2(record.projection);
  const feed = asRecord2(record.feed);
  const mirror = asRecord2(record.mirror);
  const forget = asRecord2(record.forget);
  return {
    id: readString2(record.id, `provider-${index + 1}`),
    kind: readString2(record.kind, "tencent"),
    enabled: readBool(record.enabled, true),
    roles: readRoles(record.roles),
    projection: {
      scopes: readStringArray(projection.scopes),
      types: readStringArray(projection.types),
      exclude_tags: readStringArray(projection.exclude_tags)
    },
    feed: {
      scope: readString2(feed.scope, "global"),
      type: readString2(feed.type, "knowledge"),
      limit: readInt(feed.limit, 50, 1, 500),
      tags: readStringArray(feed.tags),
      scope_from_tags: readBool(feed.scope_from_tags, false)
    },
    mirror: {
      trigger: (() => {
        const trigger = readString2(mirror.trigger, "manual");
        return trigger === "accepted" || trigger === "schedule" || trigger === "cited" ? trigger : "manual";
      })(),
      include_body: readBool(mirror.include_body, true),
      max_body_chars: readInt(mirror.max_body_chars, 4e3, 0, 1e6),
      coordinate_tags: readBool(mirror.coordinate_tags, true),
      require_citations: readInt(mirror.require_citations, 0, 0, 1e3)
    },
    forget: {
      on_deprecate: readBool(forget.on_deprecate, true),
      on_merge: readBool(forget.on_merge, false),
      max_per_run: readInt(forget.max_per_run, 100, 0, 1e5)
    },
    inject_max_tokens: readInt(record.inject_max_tokens, 300, 0, 4e3),
    config: asRecord2(record.config)
  };
}
function legacyTencentToProvider(tencent) {
  return {
    id: "tencent",
    kind: "tencent",
    enabled: tencent.enabled,
    roles: ["feed", "mirror"],
    // '*' = 全部分发：V0.7.x 的 push 没有投影概念、推全部 accepted，这里必须等价。
    // 空数组在新语义下表示"什么都不分发"，会让旧用户的行为悄悄改变。
    projection: { scopes: ["*"], types: [], exclude_tags: [] },
    feed: {
      scope: tencent.pull_scope,
      type: tencent.pull_type,
      limit: tencent.pull_limit,
      tags: ["tencent"],
      scope_from_tags: false
    },
    mirror: { trigger: "manual", include_body: true, max_body_chars: 4e3, coordinate_tags: true, require_citations: 0 },
    forget: { on_deprecate: true, on_merge: false, max_per_run: 100 },
    inject_max_tokens: 300,
    config: {
      url: tencent.url,
      api_key_env: tencent.api_key_env,
      service_id: tencent.service_id,
      team_id: tencent.team_id,
      agent_id: tencent.agent_id,
      user_id: tencent.user_id,
      task_id: tencent.task_id,
      timeout_ms: tencent.timeout_ms
    }
  };
}
function normalizeRemoteSettings(input) {
  const remote = asRecord2(input.remote);
  const rawProviders = Array.isArray(remote.providers) ? remote.providers : [];
  const explicitProviders = rawProviders.length > 0 ? rawProviders : null;
  let providers;
  let enabled;
  let mode;
  if (explicitProviders !== null) {
    providers = explicitProviders.map((entry, index) => normalizeProvider(entry, index));
    enabled = readBool(remote.enabled, false);
    const rawMode = readString2(remote.mode, "local-first");
    mode = REMOTE_MODES.includes(rawMode) ? rawMode : "local-first";
  } else if (input.tencent !== void 0) {
    providers = [legacyTencentToProvider(input.tencent)];
    enabled = input.tencent.enabled;
    mode = "local-first";
  } else {
    providers = [];
    enabled = false;
    mode = "local-first";
  }
  return { enabled, mode, providers };
}
function validateRemoteSettings(settings) {
  const errors = [];
  const seen = /* @__PURE__ */ new Set();
  for (const provider of settings.providers) {
    const label = `provider "${provider.id}"`;
    if (seen.has(provider.id)) {
      errors.push(`duplicate provider id "${provider.id}"`);
    }
    seen.add(provider.id);
    if (provider.roles.length === 0 && provider.enabled) {
      errors.push(`${label} is enabled but declares no role (expected one of ${REMOTE_ROLES.join(", ")})`);
      continue;
    }
    if (provider.roles.includes("mirror") && provider.roles.includes("authority")) {
      errors.push(
        `${label} declares both "mirror" and "authority"; they are mutually exclusive (two authorities for the same scope)`
      );
    }
    if (provider.roles.includes("authority") && settings.mode === "local-first") {
      errors.push(
        `${label} declares "authority" but remote.mode is "local-first"; set mode to "hybrid" or "remote-authority" to opt in`
      );
    }
    if (provider.roles.includes("authority")) {
      const projectScope = provider.projection.scopes.find((scope) => scope.startsWith("project"));
      if (projectScope !== void 0) {
        errors.push(
          `${label} declares "authority" but projects scope "${projectScope}"; authority is limited to global and domain:*`
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
var tencentAdapterFactory = (ctx) => {
  const apiKeyEnv = readString2(ctx.config.api_key_env, "PROXY_USER_KEY");
  const apiKey = ctx.resolveSecret(apiKeyEnv);
  if (apiKey === "") {
    throw new Error(
      `api key env ${apiKeyEnv} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs)`
    );
  }
  const client = new TencentClient({
    ...ctx.fetchImpl === void 0 ? {} : { fetchImpl: ctx.fetchImpl },
    config: {
      url: readString2(ctx.config.url, "http://127.0.0.1:8420"),
      apiKey,
      serviceId: readString2(ctx.config.service_id, "default"),
      teamId: readString2(ctx.config.team_id, ""),
      agentId: readString2(ctx.config.agent_id, ""),
      userId: readString2(ctx.config.user_id, ""),
      taskId: readString2(ctx.config.task_id, ""),
      timeoutMs: readInt(ctx.config.timeout_ms, 1e4, 100, 12e4)
    }
  });
  return new TencentAdapter({ id: ctx.providerId, client });
};
var DEFAULT_ADAPTER_FACTORIES = {
  tencent: tencentAdapterFactory,
  "http-json": httpJsonAdapterFactory
};
var RemoteRegistry = class {
  settings;
  handles;
  constructor(settings, options) {
    this.settings = settings;
    const factories = options.factories ?? DEFAULT_ADAPTER_FACTORIES;
    this.handles = /* @__PURE__ */ new Map();
    for (const provider of settings.providers) {
      if (!provider.enabled) {
        this.handles.set(provider.id, { settings: provider, adapter: null, error: "provider is disabled" });
        continue;
      }
      const factory = factories[provider.kind];
      if (factory === void 0) {
        const known = Object.keys(factories).join(", ");
        this.handles.set(provider.id, {
          settings: provider,
          adapter: null,
          error: `unknown provider kind "${provider.kind}" (registered: ${known})`
        });
        continue;
      }
      try {
        const ctx = {
          providerId: provider.id,
          config: provider.config,
          resolveSecret: options.resolveSecret,
          ...options.fetchImpl === void 0 ? {} : { fetchImpl: options.fetchImpl }
        };
        this.handles.set(provider.id, { settings: provider, adapter: factory(ctx), error: null });
      } catch (error) {
        this.handles.set(provider.id, {
          settings: provider,
          adapter: null,
          error: error.message
        });
      }
    }
  }
  get settingsSnapshot() {
    return this.settings;
  }
  /** 全部 provider（含被禁用与构造失败的），按配置顺序。 */
  list() {
    return [...this.handles.values()];
  }
  get(providerId) {
    return this.handles.get(providerId) ?? null;
  }
  /** 承担某角色的**可用** provider（enabled 且 adapter 构造成功）。 */
  byRole(role) {
    return this.list().filter(
      (handle) => handle.adapter !== null && handle.settings.enabled && handle.settings.roles.includes(role)
    );
  }
  /** 角色到 provider id 的映射，供 status / 面板展示。 */
  roleSummary() {
    const summary = {};
    for (const role of REMOTE_ROLES) {
      summary[role] = this.byRole(role).map((handle) => handle.settings.id);
    }
    return summary;
  }
  async close() {
    for (const handle of this.handles.values()) {
      try {
        await handle.adapter?.close?.();
      } catch {
      }
    }
  }
};

// src/config.ts
var DEFAULT_MUTATING_TOOLS = [
  "bash",
  "pwsh",
  "write",
  "edit",
  "str_replace_editor"
];
var DEFAULT_EXEMPT_TOOLS = [
  "memory_search",
  "memory_get",
  "memory_status",
  "memory_preflight",
  "memory_cite",
  "memory_propose",
  "memory_commit",
  "memory_close_task",
  "memory_consolidate",
  "memory_maintenance"
];
var DISTILL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
var distillSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  time: external_exports.string().regex(DISTILL_TIME_PATTERN, "distill time must be HH:mm").default("03:30"),
  // new = 每次投递新建会话（cwd 固定为工作区 root）；session = 投递到已有会话。
  target: external_exports.enum(["new", "session"]).default("new"),
  session_id: external_exports.string().nullable().optional(),
  agent_preset: external_exports.string().min(1).nullable().optional(),
  max_proposals: external_exports.number().int().min(1).max(20).default(5)
}).default({});
var reflectSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  time: external_exports.string().regex(DISTILL_TIME_PATTERN, "reflect time must be HH:mm").default("04:30"),
  target: external_exports.enum(["new", "session"]).default("new"),
  session_id: external_exports.string().nullable().optional(),
  agent_preset: external_exports.string().min(1).nullable().optional(),
  max_candidates: external_exports.number().int().min(1).max(20).default(5),
  lookback_days: external_exports.number().int().min(1).max(365).default(30)
}).default({});
var coreWorkspaceSchema = external_exports.object({
  id: external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "core workspace id must be a slug (letters, digits, dot, underscore, dash)"),
  name: external_exports.string().min(1).optional(),
  root: external_exports.string().min(1).optional(),
  distill: distillSchema.optional(),
  reflect: reflectSchema.optional()
});
var workspaceSchema = external_exports.object({
  id: external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "workspace id must be a slug (letters, digits, dot, underscore, dash)"),
  core_id: external_exports.string().optional().nullable(),
  root: external_exports.string().min(1),
  domains: external_exports.array(external_exports.string().min(1)).default([]),
  admin: external_exports.boolean().default(false),
  enabled: external_exports.boolean().default(true),
  distill: distillSchema.optional(),
  reflect: reflectSchema.optional()
});
var preflightSchema = external_exports.object({
  mode: external_exports.enum(["per-turn", "off"]).default("per-turn"),
  pack_tokens: external_exports.number().int().positive().max(8e3).default(600),
  max_hits: external_exports.number().int().min(1).max(20).default(6),
  // 低于该分数的命中不进入预检包；0 表示不过滤。新手配置默认 1.0。
  min_score: external_exports.number().min(0).max(1e3).default(0),
  // 当前工作区自己的 project 知识在排序时的倍率；1 表示不提升。新手配置默认 1.2。
  local_boost: external_exports.number().min(1).max(3).default(1),
  inject: external_exports.enum(["compact", "off"]).default("compact"),
  // 阶段三：在预检包里加一行"可主动检索/写入记忆"的能力提示，提升采用率。
  hint_tools: external_exports.boolean().default(true)
}).default({});
var gateSchema = external_exports.object({
  mode: external_exports.enum(["enforce", "off"]).default("enforce"),
  on_preflight_error: external_exports.enum(["allow", "deny"]).default("allow"),
  unknown_tools: external_exports.enum(["allow", "deny"]).default("allow"),
  mutating_tools: external_exports.array(external_exports.string().min(1)).default(DEFAULT_MUTATING_TOOLS),
  exempt_tools: external_exports.array(external_exports.string().min(1)).default(DEFAULT_EXEMPT_TOOLS)
}).default({});
var limitsSchema = external_exports.object({
  max_pending_per_task: external_exports.number().int().min(1).max(500).default(20),
  max_body_bytes: external_exports.number().int().min(1024).max(1048576).default(65536),
  max_source_refs: external_exports.number().int().min(0).max(100).default(20)
}).default({});
var maintenanceSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  time: external_exports.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "maintenance time must be HH:mm").default("03:00"),
  apply: external_exports.enum(["report", "propose"]).default("propose"),
  all_cores: external_exports.boolean().default(true),
  max_proposals: external_exports.number().int().min(1).max(20).default(10),
  stale_pending_days: external_exports.number().int().min(1).max(3650).default(30),
  stale_citation_days: external_exports.number().int().min(1).max(3650).default(90)
}).default({});
var temporalSchema = external_exports.object({
  aging_days: external_exports.number().int().min(1).max(3650).default(90),
  aging_decay: external_exports.number().min(0.1).max(1).default(0.85),
  stale_decay: external_exports.number().min(0.1).max(1).default(0.6),
  scheduled_decay: external_exports.number().min(0.1).max(1).default(0.3)
}).default({});
var dedupeSchema = external_exports.object({
  threshold: external_exports.number().min(0.5).max(1).default(0.72),
  max_pairs: external_exports.number().int().min(1).max(100).default(20)
}).default({});
var reflectPolicySchema = external_exports.object({
  max_chars: external_exports.number().int().min(500).max(4e4).default(8e3),
  max_sessions: external_exports.number().int().min(1).max(10).default(3),
  min_messages: external_exports.number().int().min(1).max(50).default(4)
}).default({});
var tencentSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  // 数据面地址（memory-core），例如 http://127.0.0.1:8420。
  url: external_exports.string().min(1).default("http://127.0.0.1:8420"),
  // 鉴权 token 的环境变量名（不落盘密钥），例如 PROXY_USER_KEY。
  api_key_env: external_exports.string().min(1).default("PROXY_USER_KEY"),
  service_id: external_exports.string().min(1).default("default"),
  team_id: external_exports.string().default(""),
  agent_id: external_exports.string().default(""),
  user_id: external_exports.string().default(""),
  task_id: external_exports.string().default(""),
  // 定时同步间隔（分钟）；0 = 不启用定时，只手动触发。
  sync_interval_min: external_exports.number().int().min(0).max(10080).default(30),
  // pull 时生成候选的作用域与类型。
  pull_scope: external_exports.string().default("global"),
  pull_type: external_exports.enum(KNOWLEDGE_TYPES).default("knowledge"),
  pull_limit: external_exports.number().int().min(1).max(500).default(50),
  timeout_ms: external_exports.number().int().min(100).max(12e4).default(1e4)
}).default({});
var remoteProjectionSchema = external_exports.object({
  // 允许分发出去的作用域模式（`global`、`domain:*`）；空 = 不分发任何作用域。
  scopes: external_exports.array(external_exports.string()).default([]),
  types: external_exports.array(external_exports.enum(KNOWLEDGE_TYPES)).default([]),
  exclude_tags: external_exports.array(external_exports.string()).default([])
}).default({});
var remoteProviderSchema = external_exports.object({
  id: external_exports.string().min(1),
  kind: external_exports.string().min(1).default("tencent"),
  enabled: external_exports.boolean().default(true),
  roles: external_exports.array(external_exports.enum(REMOTE_ROLES)).default([]),
  projection: remoteProjectionSchema,
  feed: external_exports.object({
    scope: external_exports.string().default("global"),
    type: external_exports.enum(KNOWLEDGE_TYPES).default("knowledge"),
    limit: external_exports.number().int().min(1).max(500).default(50),
    tags: external_exports.array(external_exports.string()).default([]),
    // pull 作用域还原：按远端 mh: 坐标 tags 还原到本地结构（§5.8.2）。
    scope_from_tags: external_exports.boolean().default(false)
  }).default({}),
  mirror: external_exports.object({
    trigger: external_exports.enum(["manual", "accepted", "schedule", "cited"]).default("manual"),
    include_body: external_exports.boolean().default(true),
    max_body_chars: external_exports.number().int().min(0).max(1e6).default(4e3),
    // push 坐标编码：mh: 命名空间 tags（§5.8.1）。
    coordinate_tags: external_exports.boolean().default(true),
    // 萃取驱动的上报门槛（§5.9.2）：被 memory_cite 引用 ≥ N 次才推。0 = 不设门槛。
    require_citations: external_exports.number().int().min(0).max(1e3).default(0)
  }).default({}),
  forget: external_exports.object({
    // 明确作废 → 远端同步作废。默认开：语义单一。
    on_deprecate: external_exports.boolean().default(true),
    // merge 折叠 → 远端作废。**默认关**：被合并项内容已在 target 正文里活着。
    on_merge: external_exports.boolean().default(false),
    // 单次传播上限；0 = 不限。可由面板配置。
    max_per_run: external_exports.number().int().min(0).max(1e5).default(100)
  }).default({}),
  // hybrid 组合检索：该 provider 注入预检包的 token 上限；0 = 不参与预检注入。
  // 上限防止单个远端吃掉整个预检包（proposal-remote-providers §5.7）。
  inject_max_tokens: external_exports.number().int().min(0).max(4e3).default(300),
  // provider 自带连接参数，adapter 自己解释（腾讯：url/api_key_env/...）。
  config: external_exports.record(external_exports.unknown()).default({})
});
var remoteSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  mode: external_exports.enum(REMOTE_MODES).default("local-first"),
  // hybrid 组合检索的整轮 fan-out 死线：到点未返回的远端按 unavailable 处理。
  // 预检在每回合开头跑，慢远端绝不能拖住回合。
  hybrid: external_exports.object({
    deadline_ms: external_exports.number().int().min(200).max(1e4).default(2e3)
  }).default({}),
  providers: external_exports.array(remoteProviderSchema).default([])
}).default({});
var layersSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  // 达到该条目数时 status/面板提示启用分层（不强制）。
  suggest_at_entries: external_exports.number().int().min(100).max(1e7).default(2e4),
  // 场景归纳目录名（相对 hub root）；空 = 关闭场景归纳。
  scenario_dir: external_exports.string().default("scenario")
}).default({});
var configSchema = external_exports.object({
  version: external_exports.literal(1).default(1),
  hub: external_exports.object({ id: external_exports.string().min(1).default("primary") }).default({}),
  core_workspaces: external_exports.array(coreWorkspaceSchema).default([]),
  workspaces: external_exports.array(workspaceSchema).default([]),
  policy: external_exports.object({
    approval: external_exports.object({
      mode: external_exports.enum(["manual", "auto"]).default("manual")
    }).default({}),
    panel: external_exports.object({
      // 面板「待审批」是否提供人工点击的批准/拒绝；关闭时面板恢复只读。
      review: external_exports.boolean().default(true)
    }).default({}),
    preflight: preflightSchema,
    gate: gateSchema,
    evidence: external_exports.object({
      required_for: external_exports.array(external_exports.enum(KNOWLEDGE_TYPES)).default([
        "decision",
        "constraint",
        "process",
        "api-catalog",
        "runtime-base",
        "playbooks"
      ])
    }).default({}),
    limits: limitsSchema,
    maintenance: maintenanceSchema,
    temporal: temporalSchema,
    dedupe: dedupeSchema,
    reflect: reflectPolicySchema
  }).default({}),
  consolidation: external_exports.object({
    mode: external_exports.literal("manual").default("manual"),
    target_scope: external_exports.string().default("global")
  }).default({}),
  tencent: tencentSchema,
  remote: remoteSchema,
  layers: layersSchema,
  storage: external_exports.object({
    watch: external_exports.boolean().default(true),
    lock_stale_ms: external_exports.number().int().positive().default(6e5),
    // 检索索引后端：auto = 条目数达到阈值且 node:sqlite 可用时用 SQLite，
    // 否则用内存索引；sqlite/memory 为显式选择（不可用时仍回退内存并记诊断）。
    index: external_exports.enum(["auto", "memory", "sqlite"]).default("auto"),
    sqlite_min_entries: external_exports.number().int().min(1e3).max(1e7).default(3e4),
    // 每轮进入精确打分的候选上限；小 Hub 会全量打分，结果与内存索引完全一致。
    index_candidate_limit: external_exports.number().int().min(100).max(1e6).default(2e3)
  }).default({})
});
var DEFAULT_CONFIG_YAML = `# Memory Hub configuration (npm package: dsh-memory-hub)
# This file is the portable configuration of your memory store. Back it up with
# the rest of the directory.
version: 1
hub:
  id: primary

# Core workspaces are memory hubs. If a core workspace has a root, it becomes
# an independent memory hub; sessions whose working directory is under that root
# use that hub. Sub-workspaces (core_id below) live inside the same hub.
#
# distill (optional) schedules a memory distillation in that workspace through
# the Host schedule service. target: new creates a fresh session with cwd set
# to the workspace root; target: session delivers to an existing session id.
# Distillation only proposes candidates (scope "parent" / "global"); a human still
# approves them in the panel.
core_workspaces: []
#  - id: product
#    name: '\u4EA7\u54C1\u4E3B\u4ED3\u5E93'
#    root: 'D:/projects/product'
#    distill:
#      enabled: true
#      time: '03:30'
#      target: new          # new | session
#      max_proposals: 5
#    reflect:
#      enabled: false       # retrospective extraction over this workspace's finished sessions
#      time: '04:30'
#      max_candidates: 5
#      lookback_days: 30

# Register the project roots you want project-scoped memory for. Sessions whose
# working directory is inside one of these roots see global + domain + project
# entries; other sessions see global + domain entries only.
workspaces: []
#  - id: backend
#    core_id: product
#    root: 'D:/projects/product/backend'
#    domains: [backend]
#    admin: true
#    enabled: true
#    distill:
#      enabled: true
#      time: '04:00'
#      target: session
#      session_id: session-xxxx
#    reflect:
#      enabled: false
#      time: '04:35'

policy:
  approval:
    mode: manual          # manual | auto (auto is for local testing only: commits are logged as test:auto)
  preflight:
    mode: per-turn        # per-turn | off
    pack_tokens: 600
    max_hits: 6
    min_score: 1.0        # drop weak matches; 0 keeps every BM25 hit
    local_boost: 1.2      # prefer project:<current-workspace> over core hits
    inject: compact       # compact | off
  gate:
    mode: enforce         # enforce | off
    on_preflight_error: allow   # allow | deny
    unknown_tools: allow        # allow | deny
    mutating_tools: [bash, pwsh, write, edit, str_replace_editor]
    exempt_tools: [memory_search, memory_get, memory_status, memory_preflight,
                   memory_cite, memory_propose, memory_commit,
                   memory_close_task, memory_consolidate]
  evidence:
    required_for: [decision, constraint, process, api-catalog, runtime-base, playbooks]
  limits:
    max_pending_per_task: 20
    max_body_bytes: 65536
    max_source_refs: 20
  maintenance:
    enabled: false        # true = run the deterministic nightly maintenance timer
    time: '03:00'         # local HH:mm; missed runs execute on the next Host start
    apply: propose        # report | propose (propose only creates pending; never commits)
    all_cores: true
    max_proposals: 10
    stale_pending_days: 30
    stale_citation_days: 90
  temporal:
    aging_days: 90          # days without confirmation before an entry is "aging"
    aging_decay: 0.85       # score multiplier for aging entries
    stale_decay: 0.6        # score multiplier once expires_at has passed
    scheduled_decay: 0.3    # score multiplier for valid_from entries not yet in effect
  dedupe:
    threshold: 0.72         # combined similarity above which a pair is reported as near-duplicate
    max_pairs: 20           # cap on reported pairs per scan
  reflect:
    max_chars: 8000         # digest size cap per session (user asks + assistant conclusions + failed tools)
    max_sessions: 3         # sessions per memory_reflect call
    min_messages: 4         # shorter sessions are skipped as too-short

consolidation:
  mode: manual
  target_scope: global

# \u8FDC\u7AEF\u8BB0\u5FC6 provider\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u5173\u95ED\uFF09\u3002\u5173\u95ED\u65F6\u96F6\u7F51\u7EDC\u8BF7\u6C42\u3001\u4E0D\u6784\u9020\u4EFB\u4F55 adapter\u3002
#
# \u8BBE\u8BA1\u8981\u70B9\uFF1A\u8FDC\u7AEF\u6309 [\u89D2\u8272] \u63A5\u5165\uFF0C\u4E0D\u6309\u5382\u5546\u63A5\u5165\u3002
#   feed      \u8FDC\u7AEF -> \u672C\u5730\u5019\u9009\uFF08\u4EA7\u7269\u6C38\u8FDC\u662F pending/\uFF0C\u7EDD\u4E0D\u81EA\u52A8 commit\uFF09
#   mirror    \u672C\u5730 -> \u8FDC\u7AEF\uFF08\u53EA\u5206\u53D1\uFF0C\u4E0D\u6539\u672C\u5730\u6743\u5A01\uFF09
#   authority \u8FDC\u7AEF\u6743\u5A01\uFF0C\u672C\u5730\u53EA\u8BFB\uFF08\u4EC5\u9650 global / domain:*\uFF0C\u4E14\u5FC5\u987B mode != local-first\uFF09
#   index     \u53EA\u8BFB\u68C0\u7D22\uFF0C\u4E0D\u53C2\u4E0E\u540C\u6B65
#
# \u4E0D\u5199 remote.providers \u65F6\uFF0C\u4E0B\u9762\u7684\u65E7 tencent: \u6BB5\u4F1A\u88AB\u81EA\u52A8 desugar \u6210
# \u4E00\u4E2A {id: tencent, roles: [feed, mirror]} \u7684 provider \u2014\u2014 \u65E7\u914D\u7F6E\u884C\u4E3A\u9010\u5B57\u4E0D\u53D8\u3002
# \u4E00\u65E6\u5199\u4E86\u975E\u7A7A\u7684 providers\uFF0C\u65E7\u6BB5\u5C31\u88AB\u5FFD\u7565\uFF08\u8FC1\u79FB\u540E\u4E0D\u4F1A\u5077\u5077\u751F\u6548\uFF09\u3002
#
# remote:
#   enabled: false
#   mode: local-first             # local-first | hybrid | remote-authority
#   hybrid:
#     deadline_ms: 2000           # \u7EC4\u5408\u68C0\u7D22\u6574\u8F6E\u6B7B\u7EBF\uFF1A\u5230\u70B9\u672A\u8FD4\u56DE\u7684\u8FDC\u7AEF\u6309 unavailable \u5904\u7406
#   providers:
#     - id: tencent               # \u5B9E\u4F8B id\uFF0C\u8D26\u672C\u4E0E\u5DE5\u5177\u53C2\u6570\u90FD\u7528\u5B83
#       kind: tencent             # \u6CE8\u518C\u8868\u91CC\u7684 adapter kind
#       enabled: true
#       roles: [feed, mirror]
#       inject_max_tokens: 300    # hybrid \u7EC4\u5408\u68C0\u7D22\u7684\u6CE8\u5165\u4E0A\u9650\uFF080 = \u4E0D\u53C2\u4E0E\u9884\u68C0\u6CE8\u5165\uFF09
#       projection:               # \u54EA\u4E9B\u672C\u5730\u77E5\u8BC6\u5141\u8BB8\u5206\u53D1\u51FA\u53BB
#         scopes: [global, 'domain:*']
#         types: [decision, constraint, knowledge, api-catalog, process]
#         exclude_tags: [local-only]
#       feed:
#         scope: global
#         type: knowledge
#         limit: 50
#         tags: [tencent]
#       mirror:
#         trigger: manual         # manual | accepted | schedule
#         include_body: true
#         max_body_chars: 4000    # \u786C\u9876\uFF1A\u8FDC\u7AEF\u53EA\u6536\u6458\u8981 + \u622A\u65AD\u6B63\u6587
#       forget:
#         on_deprecate: true      # \u9ED8\u8BA4\u5F00\uFF1A\u660E\u786E\u4F5C\u5E9F -> \u8FDC\u7AEF\u540C\u6B65\u4F5C\u5E9F
#         on_merge: false         # \u9ED8\u8BA4\u5173\uFF1Amerge \u662F"\u6298\u53E0\u6210\u4E00\u6761"\u4E0D\u662F"\u5220\u9664"
#         max_per_run: 100        # \u5355\u6B21\u4F20\u64AD\u4E0A\u9650\uFF080 = \u4E0D\u9650\uFF09\uFF1B\u9762\u677F\u53EF\u6539
#       config:                   # provider \u81EA\u5E26\u8FDE\u63A5\u53C2\u6570\uFF08\u817E\u8BAF\uFF1A\u89C1\u4E0B\u65B9 tencent \u6BB5\u5B57\u6BB5\uFF09
#         url: 'http://127.0.0.1:8420'
#         api_key_env: PROXY_USER_KEY
#         service_id: default
#
#     # kind: http-json \u2014\u2014 \u4E0D\u5199\u4EE3\u7801\u63A5"\u5176\u4ED6\u5BB6"\uFF1A\u7AEF\u70B9\u4E0E\u5B57\u6BB5\u6620\u5C04\u5168\u5728\u914D\u7F6E\u91CC\u3002
#     # \u80FD\u529B\u5FC5\u987B\u663E\u5F0F\u58F0\u660E\uFF1B\u58F0\u660E\u4E86\u4F46\u6CA1\u914D\u7AEF\u70B9 = \u8C03\u7528\u65F6 unsupported\uFF08\u4E0D\u731C\u3001\u4E0D\u9759\u9ED8\uFF09\u3002
#     # \u5BC6\u94A5\u53EA\u8D70 token_env\uFF08\u73AF\u5883\u53D8\u91CF\u6216 $DSH_HOME/.credentials.yaml\uFF09\uFF0C\u4E0D\u843D\u76D8\u3002
#     - id: my-memory
#       kind: http-json
#       enabled: true
#       roles: [index]            # index = \u53EA\u8BFB\u68C0\u7D22\uFF0C\u4E0D\u53C2\u4E0E\u540C\u6B65
#       config:
#         base_url: 'https://memory.example.com'
#         auth: { type: bearer, token_env: MY_MEMORY_TOKEN }   # \u6216 { type: header, token_env: X, name: x-api-key }
#         headers: { x-tenant: acme }
#         timeout_ms: 10000
#         endpoints:
#           list:   { method: POST, path: /v1/memories/list,   body: { limit: '{{limit}}', cursor: '{{cursor}}' } }
#           search: { method: POST, path: /v1/memories/search, body: { query: '{{text}}', limit: '{{limit}}' } }
#           append: { method: POST, path: /v1/memories,        body: { title: '{{title}}', content: '{{body}}', key: '{{idempotency_key}}' } }
#         mapping:                  # \u53EA\u652F\u6301 $.a.b \u70B9\u8DEF\u5F84\u53D6\u503C\uFF0C\u4E0D\u652F\u6301\u8868\u8FBE\u5F0F
#           items: '$.data.items'
#           id: '$.id'
#           title: '$.title'
#           summary: '$.summary'
#           body: '$.content'
#           scope: '$.metadata.scope'
#           tags: '$.tags'
#           updated_at: '$.updated_at'
#           next_cursor: '$.data.next'
#         capabilities: [read.list, read.search, write.append]

# \u817E\u8BAF Agent Memory \u6865\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u5173\u95ED\uFF09\u3002\u5173\u95ED\u65F6\u96F6\u7F51\u7EDC\u8BF7\u6C42\uFF0C\u884C\u4E3A\u4E0E 0.7.1 \u4E00\u81F4\u3002
# \u5F00\u542F\u540E memory_tencent_pull \u62C9\u53D6\u817E\u8BAF L1/L2 \u751F\u6210 pending \u5019\u9009\uFF08\u4EBA\u5BA1\u540E\u624D\u5165\u5E93\uFF09\uFF0C
# memory_tencent_push \u628A\u672C\u5730 accepted \u77E5\u8BC6\u5206\u53D1\u5230\u817E\u8BAF\u901A\u9053\u3002
# \u65B0\u914D\u7F6E\u8BF7\u6539\u7528\u4E0A\u9762\u7684 remote.providers\uFF1B\u672C\u6BB5\u4FDD\u7559\u4E3A\u517C\u5BB9\u5165\u53E3\u3002
tencent:
  enabled: false
  url: 'http://127.0.0.1:8420'    # memory-core \u6570\u636E\u9762
  api_key_env: PROXY_USER_KEY     # \u8BFB\u53D6 token \u7684\u73AF\u5883\u53D8\u91CF\u540D\uFF08\u4E0D\u843D\u76D8\uFF09
  service_id: default
  team_id: ''                     # \u4F8B\uFF1Ateam-oorlv5kamx
  agent_id: ''                    # \u4F8B\uFF1Aagt-oorq6rzprf
  user_id: ''                     # \u4F8B\uFF1Ausr-oon04odpor
  task_id: ''
  sync_interval_min: 30           # \u5B9A\u65F6\u540C\u6B65\u95F4\u9694\uFF1B0 = \u53EA\u624B\u52A8
  pull_scope: global
  pull_type: knowledge
  pull_limit: 50
  timeout_ms: 10000

# \u53EF\u9009\u5206\u5C42\u8BB0\u5FC6\uFF08\u9636\u6BB5\u4E09\uFF0C\u9ED8\u8BA4 flat\uFF09\u3002
layers:
  enabled: false                  # true \u65F6 status \u63D0\u793A\u5206\u5C42\u5EFA\u8BAE\uFF0C\u68C0\u7D22\u884C\u4E3A\u4E0D\u53D8
  suggest_at_entries: 20000       # \u6761\u76EE\u6570\u8FBE\u5230\u8BE5\u503C\u65F6\u5EFA\u8BAE\u542F\u7528
  scenario_dir: scenario          # \u573A\u666F\u5F52\u7EB3\u76EE\u5F55\uFF08\u7A7A\u5B57\u7B26\u4E32 = \u5173\u95ED\uFF09

storage:
  watch: true
  lock_stale_ms: 600000
  # auto = use the derived SQLite index once the Hub exceeds sqlite_min_entries
  # (requires Node.js >= 22.5 for node:sqlite; otherwise the memory index is used).
  index: auto
  sqlite_min_entries: 30000
  # Entries scored exactly per query. Small Hubs score every candidate (same
  # results as the memory index); only very broad queries hit this cap.
  index_candidate_limit: 2000
`;
async function readConfigFile(path) {
  let raw;
  try {
    raw = await readFile2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new MemoryError("STORAGE_ERROR", `cannot read ${path}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = (0, import_yaml.parse)(raw);
  } catch (error) {
    throw new MemoryError("INVALID_INPUT", `invalid YAML in ${path}: ${error.message}`);
  }
  const result = configSchema.safeParse(parsed ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
    throw new MemoryError("INVALID_INPUT", `invalid config ${path}: ${details}`);
  }
  return result.data;
}
function defaultConfig() {
  return configSchema.parse({});
}

// src/hub-readme.ts
import { readFile as readFile3 } from "node:fs/promises";
import { join as join2 } from "node:path";
var HUB_README_VERSION = 3;
var PRIMARY_NAME = "README.md";
var FALLBACK_NAME = "MEMORY-HUB.md";
var MARKER_PATTERN = /<!--\s*dsh-memory-hub:hub-readme\s+(\d+)\s*-->/;
async function ensureHubReadme(hub) {
  if (hub.readOnly) return "skipped";
  const plan = await planWrite(hub.root);
  if (plan === null) return "skipped";
  await ensureDir(hub.root);
  await writeAtomic(join2(hub.root, plan.name), renderHubReadme(hub, plan.name === FALLBACK_NAME));
  return plan.action;
}
async function readMaybe(path) {
  try {
    return await readFile3(path, "utf8");
  } catch {
    return null;
  }
}
async function planWrite(root) {
  const primary = await readMaybe(join2(root, PRIMARY_NAME));
  const primaryPlan = evaluate(PRIMARY_NAME, primary);
  if (primaryPlan === "skip") return null;
  if (primaryPlan !== "fallback") return primaryPlan;
  const fallback = await readMaybe(join2(root, FALLBACK_NAME));
  const fallbackPlan = evaluate(FALLBACK_NAME, fallback);
  if (fallbackPlan === "fallback" || fallbackPlan === "skip") return null;
  return fallbackPlan;
}
function evaluate(name, existing) {
  if (existing === null) return { name, action: "created" };
  const match = MARKER_PATTERN.exec(existing);
  if (match === null) return "fallback";
  const version = Number(match[1]);
  if (!Number.isFinite(version) || version >= HUB_README_VERSION) return "skip";
  return { name, action: "updated" };
}
function renderHubReadme(hub, fallbackName = false) {
  const root = hub.displayRoot();
  const hubId = hub.config.hub.id;
  const types = KNOWLEDGE_TYPES.map(
    (type) => `| \`${type}\` | \`${TYPE_PREFIX[type]}\` | ${TYPE_PURPOSE[type]} |`
  ).join("\n");
  const nameNote = fallbackName ? "> \u6839\u76EE\u5F55\u7684 `README.md` \u662F\u4F60\u81EA\u5DF1\u7684\u6587\u6863\uFF0C\u6240\u4EE5\u8BF4\u660E\u4E66\u653E\u5728 `MEMORY-HUB.md`\u3002\n" : "";
  return `# \u8FD9\u662F Memory Hub \u6570\u636E\u76EE\u5F55\uFF08\u81EA\u52A8\u751F\u6210\uFF09

<!-- dsh-memory-hub:hub-readme ${HUB_README_VERSION} -->

> Hub id\uFF1A\`${hubId}\` \xB7 \u6839\u76EE\u5F55\uFF1A\`${root}\`
>
${nameNote}> \u672C\u6587\u4EF6\u7531 Memory Hub \u5728\u521D\u59CB\u5316/\u5347\u7EA7\u65F6\u751F\u6210\uFF0C**\u53EF\u4EE5\u7F16\u8F91**\uFF08\u4FDD\u7559\u4E0A\u9762\u7684\u6807\u8BB0\u5373\u53EF\uFF0C\u540C\u7248\u672C\u4E0D\u4F1A\u88AB\u8986\u76D6\uFF09\u3002
> \u60F3\u5FEB\u901F\u4E86\u89E3\u201C\u6BCF\u4E2A\u6587\u4EF6\u5939\u5E72\u4EC0\u4E48\u3001\u4EC0\u4E48\u80FD\u6539\u201D\uFF0C\u5148\u8BFB\u5B8C\u8FD9\u4E00\u9875\u3002

## \u4E00\u5206\u949F\u7406\u89E3

- \u8FD9\u662F\u4E00\u4E2A**\u6587\u4EF6\u539F\u751F\u7684\u957F\u671F\u8BB0\u5FC6\u5E93**\uFF1A\u4E00\u6761\u77E5\u8BC6 = \u4E00\u4E2A\u5E26 YAML frontmatter \u7684 Markdown \u6587\u4EF6\u3002
- **Markdown / YAML / JSONL \u662F\u552F\u4E00\u6743\u5A01\u6570\u636E**\uFF1B\u7D22\u5F15\u3001\u62A5\u544A\u3001\u6C34\u4F4D\u90FD\u662F\u53EF\u5220\u7684\u6D3E\u751F\u7269\u3002
- \u77E5\u8BC6\u8FDB\u5165\u8FD9\u91CC\u53EA\u6709\u4E00\u6761\u5408\u6CD5\u8DEF\u5F84\uFF1A**\u5019\u9009\uFF08pending/\uFF09\u2192 \u4EBA\u5DE5\u6279\u51C6 \u2192 \u6743\u5A01\u77E5\u8BC6\uFF08knowledge/\uFF09**\u3002
- \u6A21\u578B\u4E0D\u80FD\u81EA\u6279\uFF0C\u9762\u677F\u53EA\u63D0\u4F9B\u6279\u51C6/\u62D2\u7EDD\uFF1B\u672C\u76EE\u5F55\u91CC\u6CA1\u6709\u4EFB\u4F55\u201C\u6A21\u578B\u81EA\u52A8\u6539\u5199\u6B63\u6587\u201D\u7684\u901A\u9053\u3002

## \u76EE\u5F55\u5730\u56FE

| \u8DEF\u5F84 | \u4F5C\u7528 | \u8C01\u5199 | \u80FD\u624B\u52A8\u6539\u5417 | \u5220\u4E86\u4F1A\u600E\u6837 |
| --- | --- | --- | --- | --- |
| \`config.yaml\` | Hub \u914D\u7F6E\uFF1A\u6838\u5FC3/\u5B50\u5DE5\u4F5C\u533A\u3001\u7B56\u7565\u3001\u65F6\u6548 | \u9762\u677F / \u4F60 | \u2705 \u53EF\u4EE5\uFF08\u6539\u5B8C\u91CD\u542F\u6216\u4FDD\u5B58\uFF09 | \u4E22\u5931\u5DE5\u4F5C\u533A\u4E0E\u7B56\u7565\u914D\u7F6E |
| \`README.md\` / \`MEMORY-HUB.md\` | \u672C\u8BF4\u660E | \u63D2\u4EF6\u751F\u6210 | \u2705 \u53EF\u4EE5\uFF08\u4FDD\u7559\u6807\u8BB0\uFF09 | \u4E0B\u6B21\u542F\u52A8\u91CD\u65B0\u751F\u6210 |
| \`knowledge/<type>/<ID>.md\` | **\u6743\u5A01\u77E5\u8BC6**\uFF0C\u6309\u7C7B\u578B\u5206\u76EE\u5F55 | \u4EC5 \`memory_commit\` \u5BA1\u6279\u901A\u8FC7\u540E | \u26A0\uFE0F \u53EF\u4EE5\u6539\uFF0C\u4F46\u4F1A\u7ED5\u8FC7\u5BA1\u6279\u8BB0\u5F55\uFF1B\u4F18\u5148\u7528\u5DE5\u5177 | \u77E5\u8BC6\u6C38\u4E45\u4E22\u5931\uFF08\u6709 git \u5907\u4EFD\u53EF\u6062\u590D\uFF09 |
| \`pending/<PRO-ID>.md\` | **\u5019\u9009**\uFF0C\u5C1A\u672A\u6210\u4E3A\u6743\u5A01\u77E5\u8BC6 | \u6A21\u578B \`memory_propose\` / \u7EF4\u62A4\u626B\u63CF | \u26A0\uFE0F \u5EFA\u8BAE\u5728\u9762\u677F\u6279\u51C6\u6216\u62D2\u7EDD\uFF0C\u4E0D\u8981\u624B\u6539\u72B6\u6001 | \u5019\u9009\u4E22\u5931\uFF0C\u4E0D\u5F71\u54CD\u5DF2\u63A5\u53D7\u77E5\u8BC6 |
| \`pending/archive/\` | \u5DF2\u5904\u7406\u5019\u9009\u7684\u5F52\u6863\uFF08\u6279\u51C6/\u62D2\u7EDD\u540E\uFF09 | \u63D2\u4EF6 | \u53EA\u8BFB\u67E5\u9605 | \u5BA1\u8BA1\u7EBF\u7D22\u4E22\u5931 |
| \`records/ledger.jsonl\` | \u8FFD\u52A0\u5F0F\u8D26\u672C\uFF1A\u63D0\u6848\u3001\u6279\u51C6\u3001\u5F15\u7528\u3001\u4EFB\u52A1 | \u63D2\u4EF6\uFF08\u53EA\u8FFD\u52A0\uFF09 | \u274C \u4E0D\u8981\u624B\u6539 | \u5BA1\u8BA1/\u5F15\u7528\u8BA1\u6570\u4E22\u5931 |
| \`records/sequences.json\` | \u4E0B\u4E00\u4E2A ID \u5E8F\u53F7 | \u63D2\u4EF6 | \u274C \u4E0D\u8981\u624B\u6539 | \u53EF\u80FD\u649E\u53F7\uFF08\u53EF\u81EA\u52A8\u56DE\u586B\uFF0C\u4F46\u4E0D\u5EFA\u8BAE\uFF09 |
| \`records/index.sqlite\` | \u6D3E\u751F\u5168\u6587\u7D22\u5F15\uFF08\u5927 Hub \u624D\u6709\uFF09 | \u63D2\u4EF6\u81EA\u52A8\u91CD\u5EFA | \u2705 \u53EF\u5220 | \u4E0B\u6B21\u542F\u52A8\u81EA\u52A8\u91CD\u5EFA |
| \`records/reflect-state.json\` | \u56DE\u987E\u6C34\u4F4D\uFF08\u54EA\u4E9B\u4F1A\u8BDD\u5DF2\u56DE\u987E\uFF09 | \u63D2\u4EF6 | \u2705 \u53EF\u5220 | \u540C\u4E00\u4F1A\u8BDD\u53EF\u80FD\u88AB\u91CD\u590D\u56DE\u987E |
| \`records/maintenance-state.json\` | \u7EF4\u62A4\u4E0A\u6B21\u8FD0\u884C\u65F6\u95F4 | \u63D2\u4EF6 | \u2705 \u53EF\u5220 | \u53EA\u5F71\u54CD\u201C\u4ECA\u5929\u662F\u5426\u5DF2\u8DD1\u201D\u5224\u65AD |
| \`records/.writer.lock\` | \u8BE5\u6839\u7684\u5199\u9501\uFF08\u79DF\u7EA6 + fencing token\uFF09 | \u5F53\u524D\u5199\u8005\uFF08\u5FC3\u8DF3 15s\uFF09 | \u26A0\uFE0F \u53EA\u6709\u786E\u8BA4\u6CA1\u6709\u5176\u4ED6 DSH \u5728\u8DD1\u65F6\u624D\u5220 | \u4E0B\u4E00\u4E2A\u5199\u8005\u4F1A\u91CD\u65B0\u521B\u5EFA\uFF1B\u6D3B\u5199\u8005\u7684\u9501\u88AB\u5220\u4F1A\u77ED\u6682\u51FA\u73B0\u4E24\u4E2A\u5199\u8005 |
| \`history/\` | \u6BCF\u6B21\u63D0\u4EA4\u7684\u65E7\u7248\u672C\u5FEB\u7167 | \u63D2\u4EF6 | \u53EA\u8BFB\u67E5\u9605 | \u5386\u53F2\u7248\u672C\u4E22\u5931\uFF08\u5F53\u524D\u7248\u672C\u4E0D\u53D7\u5F71\u54CD\uFF09 |
| \`reports/\` | \u7EF4\u62A4\u62A5\u544A\uFF08\`latest.md\` + \u65F6\u95F4\u6233\uFF09 | \u63D2\u4EF6 | \u53EA\u8BFB\u67E5\u9605 | \u4E22\u5931\u5386\u53F2\u4F53\u68C0\u8BB0\u5F55 |
| \`index/\` | \u65E7\u7248\u672C\u53EF\u80FD\u9057\u7559\u7684\u7A7A\u76EE\u5F55\uFF08\u65B0 Hub \u4E0D\u518D\u521B\u5EFA\uFF09 | \u2014 | \u2705 \u53EF\u5220 | \u65E0\u5F71\u54CD |

**\u5224\u65AD\u6807\u51C6**\uFF1A\`knowledge/\`\u3001\`pending/\`\u3001\`records/ledger.jsonl\`\u3001\`records/sequences.json\`\u3001\`config.yaml\` \u662F\u6743\u5A01\u6570\u636E\uFF0C\u5220/\u6539\u524D\u5148\u5907\u4EFD\uFF1B\`records/index.sqlite\`\u3001\`records/reflect-state.json\`\u3001\`records/maintenance-state.json\`\u3001\`reports/\`\u3001\`index/\` \u662F\u6D3E\u751F\u7269\u6216\u8F85\u52A9\u6570\u636E\uFF0C\u53EF\u5220\u3002

## \u4E5D\u7C7B\u77E5\u8BC6\uFF08\u6CE8\u610F \`assets\` \u7684\u542B\u4E49\uFF09

| \u7C7B\u578B | \u524D\u7F00 | \u7528\u9014 |
| --- | --- | --- |
${types}

### \`assets\` \u5230\u5E95\u662F\u4EC0\u4E48

\`assets\` **\u4E0D\u662F**\u4EE3\u7801\u8D44\u4EA7\u3001\u6784\u5EFA\u4EA7\u7269\u6216\u4F9D\u8D56\u5305\uFF0C\u800C\u662F**\u5916\u90E8\u8D44\u6E90\u7684\u7D22\u5F15\u6761\u76EE**\uFF1A

- \u8BBE\u8BA1\u7A3F\u3001\u539F\u578B\u3001\u622A\u56FE\u3001\u5F55\u5C4F\u3001\u6F14\u793A\u6587\u7A3F\u7684\u4F4D\u7F6E\uFF1B
- \u6A21\u677F\u3001\u6E05\u5355\u3001\u63D0\u793A\u8BCD\u3001\u811A\u672C\u7247\u6BB5\u7B49\u201C\u62FF\u6765\u5373\u7528\u201D\u7684\u7D20\u6750\u8BF4\u660E\uFF1B
- \u5927\u6587\u4EF6\u672C\u4F53\u7559\u5728\u539F\u5904\uFF08\u7F51\u76D8\u3001\u4ED3\u5E93\u3001\u5171\u4EAB\u76D8\uFF09\uFF0C\u8FD9\u91CC\u53EA\u8BB0**\u5728\u54EA\u91CC\u3001\u600E\u4E48\u7528\u3001\u9002\u7528\u8FB9\u754C**\u3002

\u5199 \`assets\` \u65F6\u6B63\u6587\u53EF\u4EE5\u5F88\u77ED\uFF0C\u4F46 \`source_refs\` \u5FC5\u987B\u6307\u5411\u771F\u5B9E\u4F4D\u7F6E\uFF08\`url:\` / \`file:\` / \`note:\`\uFF09\uFF0C\u5426\u5219\u4EE5\u540E\u6CA1\u4EBA\u627E\u5F97\u5230\u3002

## \u4F5C\u7528\u57DF\u4E0E\u91D1\u5B57\u5854

| \u4F5C\u7528\u57DF | \u653E\u4EC0\u4E48 | \u4F8B\u5B50 |
| --- | --- | --- |
| \`project:<\u5F53\u524D\u5DE5\u4F5C\u533A>\` | \u672C\u4ED3\u7279\u5B9A\u51B3\u7B56\u3001\u7EA6\u675F\u3001\u6D41\u7A0B\u3001\u5751 | \u672C\u4ED3\u7528 pnpm |
| \`scope: "core"\` | \u53EF\u590D\u7528\u5230\u540C\u6838\u5FC3\u4ED3\u5176\u4ED6\u5B50\u5DE5\u4F5C\u533A\u7684\u7ECF\u9A8C | \u63D2\u4EF6\u53D1\u5E03 checklist |
| \`domain:<id>\` | \u8DE8\u9879\u76EE\u7684\u9886\u57DF\u77E5\u8BC6 | \u67D0\u534F\u8BAE/\u6846\u67B6\u7684\u901A\u7528\u7EA6\u675F |
| \`global\` | \u7A33\u5B9A\u3001\u8DE8\u9879\u76EE\u7684\u901A\u7528\u7EA6\u5B9A\uFF08\u614E\u7528\uFF09 | \u63D0\u4EA4\u4FE1\u606F\u89C4\u8303 |

- \u5B50\u5DE5\u4F5C\u533A\u53EF\u89C1\uFF1A\u81EA\u5DF1\u7684 \`project:<id>\` + \u6838\u5FC3 \`project:<core-id>\` + \`global\`\uFF08\u53EA\u53D6\u5F53\u524D Hub \u81EA\u5DF1\u7684 global\uFF09\u3002
- \u540C\u7EA7\u5B50\u5DE5\u4F5C\u533A\u4E92\u76F8\u4E0D\u53EF\u89C1\uFF1B\u5411\u4E0A\u664B\u5347\u9760\u84B8\u998F/\u6C47\u603B\uFF0C\u4E0D\u662F\u81EA\u52A8\u6CC4\u6F0F\u3002
- \u6BCF\u4E2A \`core_workspaces[].root\` \u662F\u4E00\u4E2A\u72EC\u7ACB Hub\uFF1B\u672C\u76EE\u5F55\u5C31\u662F\u5176\u4E2D\u4E00\u4E2A\u3002

## \u5199\u5165\u6D41\u7A0B\uFF08\u552F\u4E00\u5408\u6CD5\u8DEF\u5F84\uFF09

\`\`\`text
\u6A21\u578B memory_propose  \u2192  pending/PRO-xxxx.md\uFF08\u5019\u9009\uFF0Ccandidate\uFF09
        \u2193 \u4EBA\u5728 DSH \u5BA1\u6279\u6216\u9762\u677F\u70B9\u201C\u6279\u51C6\u201D
memory_commit        \u2192  knowledge/<type>/<ID>.md\uFF08accepted\uFF09
        \u2193 \u540C\u65F6
history/ \u5FEB\u7167 + records/ledger.jsonl \u8FFD\u52A0\u4E8B\u4EF6 + \u5E8F\u53F7 +1
\`\`\`

- \u62D2\u7EDD\uFF1A\u5019\u9009\u5F52\u6863\u5230 \`pending/archive/\`\uFF0C\u4E0D\u5220\u9664\u539F\u6709\u77E5\u8BC6\u3002
- \u66F4\u65B0\uFF1A\`operation: update\` \u4F1A +1 \u7248\u672C\u5E76\u4FDD\u7559\u65E7\u7248\u672C\u5230 \`history/\`\u3002
- \u5408\u5E76\uFF1A\`operation: merge\` \u628A\u591A\u6761\u5E76\u8FDB\u4E00\u6761\uFF0C\u88AB\u5E76\u6761\u76EE\u53D8 \`superseded\` \u5E76\u5199 \`superseded_by\`\u3002
- \u7981\u6B62\uFF1A\u6A21\u578B\u81EA\u6279\u3001\u4F2A\u9020\u5BA1\u6279\u3001\u624B\u6539\u8D26\u672C\u5192\u5145\u63D0\u4EA4\u3002

## \u5E38\u7528\u5DE5\u5177

| \u76EE\u7684 | \u5DE5\u5177 |
| --- | --- |
| \u770B\u72B6\u6001 / \u8BCA\u65AD | \`memory_status\` |
| \u68C0\u7D22 | \`memory_search\`\uFF08\u5148 \`detail: "ids"\` \u626B\uFF0C\u518D \`memory_get\`\uFF09 |
| \u8BFB\u6B63\u6587 | \`memory_get\`\uFF08\u9ED8\u8BA4\u6458\u8981\uFF0C\u6309\u8282\u8BFB\uFF09 |
| \u6807\u8BB0\u5B9E\u9645\u4F7F\u7528 | \`memory_cite\` |
| \u521B\u5EFA\u5019\u9009 | \`memory_propose\` |
| \u63D0\u4EA4\u5019\u9009 | \`memory_commit\`\uFF08\u89E6\u53D1\u4EBA\u5DE5\u5BA1\u6279\uFF09 |
| \u8FD1\u91CD\u590D\u68C0\u67E5 | \`memory_duplicates\` |
| \u56DE\u987E\u5DF2\u7ED3\u675F\u4F1A\u8BDD | \`memory_reflect\` |
| \u591C\u95F4\u5DE1\u68C0 | \`memory_maintenance\`\uFF08\u53EA\u62A5\u544A / \u53EA\u751F\u6210\u5019\u9009\uFF09 |
| \u7ED3\u675F\u4EFB\u52A1 | \`memory_close_task\` |

\u5B8C\u6574\u5DE5\u4F5C\u6D41\u89C1\u9879\u76EE\u4ED3\u5E93\u7684 \`docs/06-operations/\` \u4E0E\u7CFB\u7EDF \`memory-hub\` skill\u3002

## \u7EF4\u62A4\u4E0E\u5907\u4EFD

- \u7EF4\u62A4\u6BCF\u5929 03:00\uFF08\u53EF\u914D\u7F6E\uFF09\u786E\u5B9A\u6027\u5DE1\u68C0\uFF1A\u5199\u62A5\u544A\u3001\u5FC5\u8981\u65F6\u751F\u6210 \`pending/\` \u5019\u9009\uFF0C**\u4E0D\u81EA\u52A8 commit\u3001\u4E0D\u5220\u9664\u3001\u4E0D\u6539\u5199\u6B63\u6587**\u3002
- \u5907\u4EFD\uFF1A\u6574\u4E2A\u76EE\u5F55 \`git init\` \u6216\u590D\u5236\u5373\u53EF\uFF1B\`git\` \u5FFD\u7565 \`records/index.sqlite\` \u7B49\u6D3E\u751F\u7269\u66F4\u7701\u7A7A\u95F4\u3002
- \u4F53\u91CF\u53C2\u8003\uFF1A\u7EA6 2.5KB/\u6761\uFF08Markdown\uFF09\uFF1B3 \u4E07\u6761\u4EE5\u4E0A\u624D\u4F1A\u51FA\u73B0 \`records/index.sqlite\`\u3002

## \u5B89\u5168\u8FB9\u754C

- \u4E0D\u8981\u5F80\u8FD9\u91CC\u5199\u5BC6\u94A5\u3001token\u3001\u5BC6\u7801\u3001\u79C1\u94A5\uFF1B\`memory_propose\` \u4F1A\u626B\u63CF\u5E76\u6807\u8BB0\u53EF\u7591\u5185\u5BB9\uFF0C\u4F46\u4ECD\u9700\u4EBA\u5224\u65AD\u3002
- \u53EA\u8BFB Hub\uFF08\`readOnly: true\`\u3001\u914D\u7F6E\u635F\u574F\u6216\u5199\u9501\u88AB\u5360\u7528\uFF09\u4E0D\u4F1A\u63A5\u53D7\u4EFB\u4F55\u5199\u5165\u3002
- \u5199\u9501\u662F**\u79DF\u7EA6**\uFF1A\u5D29\u6E83\uFF08pid \u4E0D\u5B58\u5728\uFF09\u3001\u5FC3\u8DF3\u8D85 \`storage.lock_stale_ms\`\uFF08\u6302\u6B7B/\u5047\u6B7B\uFF09\u3001\u6216\u8DE8\u673A\u6B8B\u7559\u90FD\u4F1A\u88AB\u81EA\u52A8\u56DE\u6536\uFF0C\u4E0D\u9700\u8981\u624B\u52A8\u5220\u9501\uFF1B\u5BF9\u65B9\u9000\u51FA\u540E\u672C\u8FDB\u7A0B\u4F1A\u5728\u4E0B\u4E00\u6B21\u5199\u5165\u65F6\u81EA\u52A8\u63A5\u7BA1\u3002
- \u9762\u677F\u53EA\u5141\u8BB8\u56DE\u73AF\u5730\u5740\u8BF7\u6C42\uFF0C\u4E14\u53EA\u63D0\u4F9B\u201C\u6279\u51C6/\u62D2\u7EDD\u201D\u4E24\u4E2A\u5199\u64CD\u4F5C\u3002

## \u5E38\u89C1\u8BEF\u7528

| \u8BEF\u7528 | \u540E\u679C | \u6B63\u786E\u505A\u6CD5 |
| --- | --- | --- |
| \u628A \`assets\` \u5F53\u4EE3\u7801\u8D44\u4EA7/\u6784\u5EFA\u4EA7\u7269 | \u8BB0\u4E86\u6CA1\u7528\u7684\u4E1C\u897F\uFF0C\u771F\u7D20\u6750\u53CD\u800C\u627E\u4E0D\u5230 | \u53EA\u8BB0\u5916\u90E8\u8D44\u6E90\u4F4D\u7F6E\u4E0E\u7528\u6CD5 |
| \u628A \`pending/\` \u5F53\u6743\u5A01\u77E5\u8BC6\u5F15\u7528 | \u672A\u6279\u51C6\u7684\u5185\u5BB9\u88AB\u5F53\u6210\u4E8B\u5B9E | \u770B \`status\`\uFF0C\u53EA\u6709 \`accepted\` \u53C2\u4E0E\u9ED8\u8BA4\u68C0\u7D22 |
| \u624B\u6539 \`knowledge/\` \u7ED5\u8FC7\u5BA1\u6279 | \u6CA1\u6709\u8D26\u672C\u4E0E\u5386\u53F2\u7248\u672C\uFF0C\u5BA1\u8BA1\u65AD\u94FE | \u8D70 \`memory_propose\` \u2192 \u5BA1\u6279 |
| \u628A\u65E5\u5FD7/\u957F\u6587\u6574\u7BC7\u585E\u8FDB\u77E5\u8BC6 | \u68C0\u7D22\u53D8\u5DEE\u3001\u4E0A\u4E0B\u6587\u53D8\u8D35 | \u5199\u7ED3\u8BBA + \u5173\u952E\u7247\u6BB5 + \u8DEF\u5F84 |
| \u624B\u6539 \`records/ledger.jsonl\` | \u5F15\u7528\u8BA1\u6570\u3001\u5BA1\u8BA1\u5931\u771F | \u53EA\u8BFB\uFF1B\u9700\u8981\u4FEE\u6B63\u7528\u65B0\u4E8B\u4EF6 |
`;
}
var TYPE_PURPOSE = {
  decision: "\u5DF2\u505A\u51FA\u7684\u9009\u62E9\u4E0E\u7406\u7531",
  constraint: "\u4E0D\u53EF\u8FDD\u53CD\u7684\u8FB9\u754C",
  knowledge: "\u5DF2\u786E\u8BA4\u7684\u4E8B\u5B9E/\u673A\u5236",
  "api-catalog": "\u63A5\u53E3\u3001\u547D\u4EE4\u3001\u534F\u8BAE\u6E05\u5355",
  process: "\u53EF\u590D\u73B0\u7684\u6D41\u7A0B/\u6B65\u9AA4",
  "open-questions": "\u672A\u51B3\u95EE\u9898\u4E0E\u5F85\u9A8C\u8BC1\u5047\u8BBE",
  "runtime-base": "\u73AF\u5883\u3001\u7248\u672C\u3001\u90E8\u7F72\u524D\u63D0",
  playbooks: "\u6392\u969C/\u64CD\u4F5C\u624B\u518C",
  assets: "\u5916\u90E8\u8D44\u6E90\uFF08\u8BBE\u8BA1\u7A3F/\u622A\u56FE/\u6A21\u677F/\u5F55\u5C4F\uFF09\u7684\u7D22\u5F15\uFF0C\u4E0D\u662F\u4EE3\u7801\u8D44\u4EA7"
};

// src/lock.ts
import { readFileSync, rmSync, statSync } from "node:fs";
import { open as open2, readFile as readFile4, rename as rename2, rm as rm2, stat as stat2 } from "node:fs/promises";
import { hostname } from "node:os";
import { basename as basename2, dirname as dirname2, join as join3 } from "node:path";
var LOCK_HEARTBEAT_MS = 15e3;
var LOCK_FORMAT_VERSION = 2;
function snapshotSync(path) {
  let raw;
  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") return { kind: "missing" };
    return { kind: "corrupt", mtimeMs: Date.now() };
  }
  const owner = parseOwner(raw);
  return owner === null ? { kind: "corrupt", mtimeMs } : { kind: "ok", owner, mtimeMs };
}
function observeLock(path, staleMs, token = null) {
  const snapshot = snapshotSync(path);
  if (snapshot.kind === "missing") {
    return { state: "missing", owner: null, expiresAt: null, reclaimable: null };
  }
  if (snapshot.kind === "corrupt") {
    return {
      state: "corrupt",
      owner: null,
      expiresAt: ownerExpiresAt(snapshot, staleMs),
      reclaimable: decideReclaim(snapshot, staleMs, Date.now())
    };
  }
  const owned = token !== null && snapshot.owner.token === token;
  return {
    state: owned ? "owned" : "foreign",
    owner: snapshot.owner,
    expiresAt: ownerExpiresAt(snapshot, staleMs),
    reclaimable: decideReclaim(snapshot, staleMs, Date.now())
  };
}
var UNKNOWN_LIVENESS_GRACE_MS = 6e4;
function liveness(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return "dead";
  if (pid === process.pid) return "alive";
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    const code = error.code;
    if (code === "ESRCH") return "dead";
    return "unknown";
  }
}
function sameHost(host) {
  return host.toLowerCase() === hostname().toLowerCase();
}
function parseOwner(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid) || parsed.pid <= 0) return null;
    if (typeof parsed.heartbeatAt !== "string" || Number.isNaN(Date.parse(parsed.heartbeatAt))) return null;
    return {
      pid: parsed.pid,
      host: typeof parsed.host === "string" ? parsed.host : "unknown",
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : parsed.heartbeatAt,
      heartbeatAt: parsed.heartbeatAt,
      token: typeof parsed.token === "string" && parsed.token !== "" ? parsed.token : null
    };
  } catch {
    return null;
  }
}
async function readSnapshot(path) {
  let raw;
  let mtimeMs;
  try {
    const info = await stat2(path);
    mtimeMs = info.mtimeMs;
    raw = await readFile4(path, "utf8");
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") return { kind: "missing" };
    return { kind: "corrupt", mtimeMs: Date.now() };
  }
  const owner = parseOwner(raw);
  return owner === null ? { kind: "corrupt", mtimeMs } : { kind: "ok", owner, mtimeMs };
}
function lastSignalMs(owner) {
  return Date.parse(owner.heartbeatAt);
}
function decideReclaim(snapshot, staleMs, now) {
  if (snapshot.kind === "missing") return null;
  if (snapshot.kind === "corrupt") return now - snapshot.mtimeMs > staleMs ? "corrupt" : null;
  if (!sameHost(snapshot.owner.host)) return "foreign-host";
  const state = liveness(snapshot.owner.pid);
  if (state === "dead") return "dead-process";
  const age = now - lastSignalMs(snapshot.owner);
  if (state === "alive") {
    return age > staleMs ? "stale-heartbeat" : null;
  }
  return age > Math.min(staleMs, UNKNOWN_LIVENESS_GRACE_MS) ? "stale-heartbeat" : null;
}
function ownerExpiresAt(snapshot, staleMs) {
  if (snapshot.kind === "missing") return null;
  if (snapshot.kind === "corrupt") return snapshot.mtimeMs + staleMs;
  return lastSignalMs(snapshot.owner) + staleMs;
}
function describeSnapshot(snapshot) {
  return snapshot.kind === "ok" ? snapshot.owner : null;
}
async function reclaim(path, expected) {
  const temp = join3(dirname2(path), `.${basename2(path)}.reclaim.${process.pid}.${randomHex(4)}`);
  try {
    await rename2(path, temp);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    return false;
  }
  const renamed = await readSnapshot(temp);
  const unchanged = expected.kind === "corrupt" ? renamed.kind === "corrupt" : expected.kind === "ok" && renamed.kind === "ok" && renamed.owner.token === expected.owner.token && renamed.owner.heartbeatAt === expected.owner.heartbeatAt;
  if (!unchanged) {
    try {
      const raw = await readFile4(temp, "utf8");
      const handle = await open2(path, "wx");
      try {
        await handle.writeFile(raw, "utf8");
      } finally {
        await handle.close();
      }
    } catch {
    }
    await rm2(temp, { force: true }).catch(() => {
    });
    return false;
  }
  await rm2(temp, { force: true }).catch(() => {
  });
  return true;
}
var activeLocks = /* @__PURE__ */ new Set();
var exitHookInstalled = false;
function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    for (const lock of [...activeLocks]) lock.releaseSync();
  });
}
var WriterLock = class _WriterLock {
  constructor(path, info, staleMs, heartbeatMs) {
    this.path = path;
    this.info = info;
    this.staleMs = staleMs;
    this.heartbeatMs = heartbeatMs;
    activeLocks.add(this);
    installExitHook();
    this.startHeartbeat();
  }
  timer = null;
  lost = false;
  releasing = false;
  onLostCallback = null;
  /** 当前进程内该 root 已持有的活跃锁（未丢失）；没有则 null。 */
  static sharedFor(path) {
    for (const lock of activeLocks) {
      if (lock.path === path && !lock.isLost) return lock;
    }
    return null;
  }
  static async acquire(path, staleMs, options = {}) {
    await ensureDir(dirname2(path));
    const shared = _WriterLock.sharedFor(path);
    if (shared !== null) {
      return { lock: shared, owner: null, reclaimed: null, ownerExpiresAt: shared.expiresAt };
    }
    const heartbeatMs = options.heartbeatMs ?? Math.min(LOCK_HEARTBEAT_MS, Math.max(250, Math.floor(staleMs / 4)));
    let reclaimed = null;
    for (let round2 = 0; round2 < 4; round2 += 1) {
      const snapshot = await readSnapshot(path);
      if (snapshot.kind === "missing") {
        const created = await _WriterLock.create(path, staleMs, heartbeatMs, reclaimed);
        if (created !== null) return created;
        continue;
      }
      const cause = decideReclaim(snapshot, staleMs, Date.now());
      if (cause === null) {
        return {
          lock: null,
          owner: describeSnapshot(snapshot),
          reclaimed,
          ownerExpiresAt: ownerExpiresAt(snapshot, staleMs)
        };
      }
      if (!await reclaim(path, snapshot)) continue;
      reclaimed = cause;
    }
    const final = await readSnapshot(path);
    return {
      lock: null,
      owner: describeSnapshot(final),
      reclaimed,
      ownerExpiresAt: ownerExpiresAt(final, staleMs)
    };
  }
  static async create(path, staleMs, heartbeatMs, reclaimed) {
    const now = nowIso();
    const info = {
      pid: process.pid,
      host: hostname(),
      startedAt: now,
      heartbeatAt: now,
      token: randomHex(8)
    };
    let handle;
    try {
      handle = await open2(path, "wx");
    } catch (error) {
      if (error.code === "EEXIST") return null;
      throw new MemoryError("STORAGE_ERROR", `cannot create writer lock ${path}: ${error.message}`);
    }
    try {
      await handle.writeFile(serialize(info), "utf8");
    } finally {
      await handle.close();
    }
    const check = await readSnapshot(path);
    if (check.kind !== "ok" || check.owner.token !== info.token) return null;
    const lock = new _WriterLock(path, info, staleMs, heartbeatMs);
    return { lock, owner: null, reclaimed, ownerExpiresAt: lock.expiresAt };
  }
  /** 租约到期时间（epoch ms）；超过它，其他写者可以接管。 */
  get expiresAt() {
    return Date.parse(this.info.heartbeatAt) + this.staleMs;
  }
  get owner() {
    return this.info;
  }
  /** 锁是否已丢失（被其他写者按租约接管，或文件被删除）。 */
  get isLost() {
    return this.lost;
  }
  /** 注册“锁已丢失”回调；`reason` 区分“被别人接管”和“文件被删”。 */
  onLost(callback) {
    this.onLostCallback = callback;
  }
  /**
   * Current relationship between this writer and the lock file.
   *
   * `missing` is deliberately separate from `foreign`: a lock file that was
   * deleted (manual cleanup, or the old owner released it) leaves the root free,
   * so this process may take it again; a `foreign` file means somebody else is
   * the writer now and this process must not write.
   */
  state() {
    if (this.lost) return "missing";
    return observeLock(this.path, this.staleMs, this.info.token).state;
  }
  /**
   * Fencing check: the lock file must still carry this writer's token. Called
   * before every write, so a writer that lost its lease stops writing instead
   * of racing the new owner.
   */
  async verifyOwnership() {
    return this.state() === "owned";
  }
  startHeartbeat() {
    this.timer = setInterval(() => {
      void this.beat();
    }, this.heartbeatMs);
    this.timer.unref?.();
  }
  async beat() {
    if (this.lost || this.releasing) return;
    try {
      const state = this.state();
      if (state === "foreign" || state === "corrupt") {
        this.markLost("foreign");
        return;
      }
      if (state === "missing") {
        this.markLost("missing");
        return;
      }
      this.info.heartbeatAt = nowIso();
      await writeAtomic(this.path, serialize(this.info));
    } catch {
    }
  }
  markLost(reason) {
    if (this.lost) return;
    this.lost = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    activeLocks.delete(this);
    try {
      this.onLostCallback?.(reason);
    } catch {
    }
  }
  /**
   * Stop tracking this handle without deciding who owns the file.
   *
   * Used when a caller has already observed the lock file and knows this handle
   * is stale: keeping the heartbeat timer alive would let a dead handle keep
   * refreshing a file it no longer owns (or would have refreshed).
   */
  detach() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lost = true;
    activeLocks.delete(this);
  }
  async release() {
    this.releasing = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    activeLocks.delete(this);
    if (this.lost) return;
    if (!await this.verifyOwnership()) return;
    await rm2(this.path, { force: true }).catch(() => {
    });
  }
  /** Synchronous best-effort release for the process exit hook. */
  releaseSync() {
    if (this.lost) return;
    try {
      const owner = parseOwner(readFileSync(this.path, "utf8"));
      if (owner === null || owner.token !== this.info.token || owner.pid !== this.info.pid) return;
      rmSync(this.path, { force: true });
    } catch {
    }
  }
};
function serialize(info) {
  return JSON.stringify({ v: LOCK_FORMAT_VERSION, ...info });
}

// src/hub.ts
function expandHome(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join4(homedir(), value.slice(2));
  return value;
}
function resolveHubRoot(configured) {
  const trimmed = configured?.trim();
  if (trimmed !== void 0 && trimmed !== "") return resolve(expandHome(trimmed));
  const dshHome = process.env.DSH_HOME?.trim();
  const base = dshHome !== void 0 && dshHome !== "" ? resolve(expandHome(dshHome)) : join4(homedir(), ".dsh");
  return join4(base, "memory-hub");
}
function describeBlocker(path, owner, expiresAt) {
  if (owner === null) return `another writer holds ${path} (unreadable lock file)`;
  const lease = expiresAt === null ? "" : `, lease expires at ${new Date(expiresAt).toISOString()}`;
  return `another writer holds ${path} (pid ${owner.pid} on ${owner.host}${lease})`;
}
var Hub = class _Hub {
  root;
  config;
  configError = null;
  /** Effective write gate: `false` only when this root can be written. */
  readOnly;
  readOnlyReason = null;
  /** Why `readOnly` is set: forced by config, unreadable config.yaml, or a busy writer lock. */
  readOnlySource = null;
  /** Explicit `readOnly: true`: the only source that also blocks config edits. */
  forcedReadOnly;
  lock = null;
  lockOwner = null;
  lockOwnerExpiresAt = null;
  lockReclaimed = null;
  /** Set when another writer took this root over mid-session (lease stolen). */
  lockLost = false;
  acquiring = null;
  configSource = null;
  lockAllowed;
  constructor(root, config, forcedReadOnly, readOnlyReason, configSource, lockAllowed) {
    this.root = root;
    this.config = config;
    this.forcedReadOnly = forcedReadOnly;
    this.readOnly = forcedReadOnly;
    this.readOnlyReason = forcedReadOnly ? readOnlyReason ?? "configured read-only" : null;
    this.readOnlySource = forcedReadOnly ? "forced" : null;
    this.configSource = configSource ?? null;
    this.lockAllowed = lockAllowed;
  }
  static async open(options = {}) {
    const isDataRoot = options.config !== void 0;
    const root = isDataRoot ? resolve(expandHome(options.root ?? "")) : resolveHubRoot(options.root);
    if (root === "") {
      throw new MemoryError("INVALID_INPUT", "hub root must not be empty");
    }
    const forcedReadOnly = options.readOnly === true;
    const lockAllowed = options.lock !== false;
    const externalConfigPath = options.configPath;
    let config;
    let configSource;
    let configError = null;
    if (isDataRoot && options.config !== void 0) {
      config = options.config;
      configSource = externalConfigPath ?? void 0;
      await ensureLayout(root);
    } else {
      const configPath = join4(root, "config.yaml");
      config = defaultConfig();
      configSource = configPath;
      await ensureLayout(root);
      if (!await pathExists(configPath)) {
        try {
          await writeAtomic(configPath, DEFAULT_CONFIG_YAML);
        } catch (error) {
          configError = `cannot create config.yaml: ${error.message}`;
        }
      }
      try {
        const loaded = await readConfigFile(configPath);
        if (loaded !== null) config = loaded;
      } catch (error) {
        configError = error.message;
      }
    }
    const hub = new _Hub(
      root,
      config,
      forcedReadOnly,
      options.readOnlyReason,
      configSource,
      lockAllowed
    );
    hub.configError = configError;
    if (configError !== null) {
      hub.markReadOnly("config", configError);
    } else if (!forcedReadOnly && lockAllowed) {
      await hub.acquireLock();
    }
    if (!hub.readOnly) {
      try {
        await ensureHubReadme(hub);
      } catch {
      }
    }
    return hub;
  }
  /**
   * Mark this hub read-only. `config` and `lock` degradations are local to this
   * root; `forced` comes from the plugin configuration and applies everywhere.
   */
  markReadOnly(source, reason) {
    this.readOnly = true;
    this.readOnlyReason = reason;
    this.readOnlySource = source;
  }
  /** Whether this hub may write `config.yaml` (atomic file write, not a knowledge write). */
  canWriteConfig() {
    return !this.forcedReadOnly;
  }
  /** 写锁诊断（面板 / `memory_status` 用）。 */
  lockInfo() {
    const onDisk = this.forcedReadOnly ? "missing" : this.lock !== null ? this.lock.state() : observeLock(this.lockPath(), this.config.storage.lock_stale_ms).state;
    return {
      held: this.lock !== null && onDisk === "owned",
      owner: this.lock === null ? this.lockOwner : null,
      expiresAt: this.lock !== null ? this.lock.expiresAt : this.lockOwnerExpiresAt,
      reclaimed: this.lockReclaimed,
      onDisk
    };
  }
  /**
   * Re-derive the in-memory read-only flag from the lock file on disk.
   *
   * A `lock` degradation is a *cached* judgement: when this hub opened, another
   * writer held the root. That judgement goes stale the moment the other process
   * exits, deletes the file, or stops refreshing its heartbeat — and a stale
   * flag is indistinguishable from a real one for `memory_status` and the panel,
   * which is exactly how "pid is gone, lock file is gone, but memory still says
   * locked" happens.
   *
   * This is synchronous so read-only report paths (status / overview / config)
   * can call it without becoming async. It never acquires the lock; a freed root
   * is simply reported writable, and the next write takes the lock through the
   * normal compare-and-set path.
   */
  revalidateLock() {
    if (this.forcedReadOnly || this.readOnlySource === "config" || !this.lockAllowed) return;
    try {
      const path = this.lockPath();
      const seen = observeLock(path, this.config.storage.lock_stale_ms, this.lock?.owner.token ?? null);
      if (this.lock !== null) {
        if (seen.state === "owned") return;
        this.lock.releaseSync();
        this.lock.detach();
        this.lock = null;
        if (seen.state === "missing") {
          this.lockLost = false;
          this.lockOwner = null;
          this.lockOwnerExpiresAt = null;
          this.markWritable();
          return;
        }
        this.lockLost = true;
        this.lockOwner = seen.owner;
        this.lockOwnerExpiresAt = seen.expiresAt;
        this.markReadOnly("lock", `lost the lease on ${path}; another writer took the root over`);
        return;
      }
      if (seen.state === "missing") {
        this.lockOwner = null;
        this.lockOwnerExpiresAt = null;
        this.markWritable();
        return;
      }
      if (seen.owner === null) {
        this.markReadOnly("lock", describeBlocker(path, null, seen.expiresAt));
        return;
      }
      this.lockOwner = seen.owner;
      this.lockOwnerExpiresAt = seen.expiresAt;
      if (seen.reclaimable === null) {
        this.markReadOnly("lock", describeBlocker(path, seen.owner, seen.expiresAt));
        return;
      }
      this.markWritable();
    } catch {
    }
  }
  /**
   * Whether this root may write *right now*.
   *
   * This is the recovery path for a degraded root: a hub that lost the lock at
   * startup (another DSH process was running) re-tries the acquisition on its
   * next write instead of staying read-only until the next restart. It also
   * fences the lock: if another writer has taken this root over — the lease
   * expired, or the lock file was replaced — this hub drops its stale handle and
   * either takes the lock back (only when it is genuinely free) or reports that
   * writing is no longer allowed.
   */
  async ensureWritable() {
    if (this.forcedReadOnly) return false;
    if (this.readOnlySource === "config") return false;
    if (this.lock !== null) {
      const state = this.lock.state();
      if (state === "owned") {
        if (this.readOnlySource === "lock") this.markWritable();
        return true;
      }
      await this.lock.release();
      this.lock = null;
      if (state === "missing") {
        this.lockLost = false;
        this.lockOwner = null;
        this.lockOwnerExpiresAt = null;
        this.markWritable();
      } else {
        this.lockLost = true;
        this.markReadOnly("lock", `lost the lease on ${this.lockPath()}; another writer took the root over`);
      }
    }
    if (!this.lockAllowed) return !this.readOnly;
    if (this.acquiring !== null) return this.acquiring;
    const run = this.acquireLock().finally(() => {
      this.acquiring = null;
    });
    this.acquiring = run;
    return run;
  }
  async acquireLock() {
    const attempt = await WriterLock.acquire(this.lockPath(), this.config.storage.lock_stale_ms);
    this.lockReclaimed = attempt.reclaimed;
    if (attempt.lock === null) {
      this.lockOwner = attempt.owner;
      this.lockOwnerExpiresAt = attempt.ownerExpiresAt;
      const blocker = describeBlocker(this.lockPath(), attempt.owner, attempt.ownerExpiresAt);
      this.markReadOnly("lock", this.lockLost ? `lost the lease; ${blocker}` : blocker);
      return false;
    }
    this.lockOwner = null;
    this.lockOwnerExpiresAt = null;
    this.lock = attempt.lock;
    this.lockLost = false;
    attempt.lock.onLost((reason) => {
      this.lock = null;
      if (reason === "missing") {
        this.lockLost = false;
        this.lockOwner = null;
        this.lockOwnerExpiresAt = null;
        this.markWritable();
        return;
      }
      this.lockLost = true;
      this.markReadOnly("lock", `lost the lease on ${this.lockPath()}; another writer took the root over`);
    });
    this.markWritable();
    return true;
  }
  /** Restore the writable state after `forced`/`config` degradation is gone. */
  markWritable() {
    if (this.forcedReadOnly) return;
    this.readOnly = false;
    this.readOnlyReason = null;
    this.readOnlySource = null;
  }
  /**
   * Re-read `config.yaml`. When the previous read-only state came from a bad
   * config, a successful reload also restores write access (and takes the lock
   * that was skipped while the hub was degraded).
   */
  async reloadConfig() {
    const path = this.configPath();
    if (path === null) {
      this.configError = "no config source for this hub";
      return;
    }
    try {
      const loaded = await readConfigFile(path);
      if (loaded === null) {
        this.configError = "config.yaml is missing";
        return;
      }
      this.config = loaded;
      this.configError = null;
      if (this.readOnlySource === "config") await this.recoverWrites();
    } catch (error) {
      this.configError = error.message;
    }
  }
  async recoverWrites() {
    this.markWritable();
    if (!this.lockAllowed) return;
    if (this.lock === null) await this.acquireLock();
  }
  async close() {
    if (this.lock !== null) {
      await this.lock.release();
      this.lock = null;
    }
  }
  configPath() {
    if (this.configSource !== null) return this.configSource;
    return join4(this.root, "config.yaml");
  }
  lockPath() {
    return join4(this.root, "records", ".writer.lock");
  }
  ledgerPath() {
    return join4(this.root, "records", "ledger.jsonl");
  }
  sequencesPath() {
    return join4(this.root, "records", "sequences.json");
  }
  /** 派生检索索引（可删除、可重建；不是权威数据）。 */
  indexPath() {
    return join4(this.root, "records", "index.sqlite");
  }
  pendingDir() {
    return join4(this.root, "pending");
  }
  pendingArchiveDir() {
    return join4(this.root, "pending", "archive");
  }
  pendingPath(id) {
    return join4(this.pendingDir(), `${id}.md`);
  }
  pendingArchivePath(id) {
    return join4(this.pendingArchiveDir(), `${id}.md`);
  }
  knowledgeDir(type) {
    return join4(this.root, "knowledge", type);
  }
  knowledgePath(type, id) {
    return join4(this.knowledgeDir(type), `${id}.md`);
  }
  historyPath(type, id, version) {
    return join4(this.root, "history", type, `${id}@v${version}.md`);
  }
  displayRoot() {
    const home = homedir();
    if (this.root === home) return "~";
    if (this.root.startsWith(home)) {
      const suffix = this.root.slice(home.length).replace(/^[/\\]/, "");
      return `~/${suffix.replace(/\\/g, "/")}`;
    }
    return this.root;
  }
  prefixFor(type) {
    return TYPE_PREFIX[type];
  }
};
async function ensureLayout(root) {
  try {
    await ensureDir(root);
    for (const type of KNOWLEDGE_TYPES) {
      await ensureDir(join4(root, "knowledge", type));
    }
    await ensureDir(join4(root, "pending", "archive"));
    await ensureDir(join4(root, "history"));
    await ensureDir(join4(root, "records"));
  } catch (error) {
    throw new MemoryError("STORAGE_ERROR", `cannot initialize memory hub at ${root}: ${error.message}`);
  }
}

// src/ledger.ts
import { open as open3, writeFile } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
function emptyState() {
  return {
    tasks: /* @__PURE__ */ new Map(),
    citations: [],
    proposalIds: /* @__PURE__ */ new Set(),
    diagnostics: []
  };
}
var Ledger = class {
  constructor(file) {
    this.file = file;
  }
  queue = Promise.resolve();
  async load(options = {}) {
    const raw = await readTextOrNull(this.file);
    if (raw === null || raw.trim() === "") return emptyState();
    let content = raw;
    if (!content.endsWith("\n")) {
      const cut = content.lastIndexOf("\n");
      content = cut >= 0 ? content.slice(0, cut + 1) : "";
      if (options.repair !== false && content !== raw) {
        await writeFile(this.file, content, "utf8");
      }
    }
    const state = emptyState();
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        state.diagnostics.push(`ignored unparsable ledger line: ${line.slice(0, 120)}`);
        continue;
      }
      if (event === null || typeof event !== "object" || typeof event.type !== "string") {
        state.diagnostics.push("ignored ledger line without a type");
        continue;
      }
      applyEvent(state, event);
    }
    return state;
  }
  append(event) {
    const line = JSON.stringify({ ...event, v: 1, at: nowIso() }) + "\n";
    const run = this.queue.then(async () => {
      try {
        await ensureDir(dirname3(this.file));
        const handle = await open3(this.file, "a");
        try {
          await handle.write(line);
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        throw new MemoryError("STORAGE_ERROR", `cannot append ledger ${this.file}: ${error.message}`);
      }
    });
    this.queue = run.catch(() => {
    });
    return run;
  }
  async close() {
    await this.queue.catch(() => {
    });
  }
};
function applyEvent(state, event) {
  switch (event.type) {
    case "task.created": {
      state.tasks.set(event.taskId, {
        taskId: event.taskId,
        sessionId: event.sessionId,
        turn: event.turn,
        workspaceId: event.workspaceId,
        intentHash: event.intentHash,
        createdAt: event.at,
        preflight: null,
        assessment: null,
        closedAt: null
      });
      break;
    }
    case "preflight.recorded": {
      const task = state.tasks.get(event.taskId);
      if (task === void 0) break;
      task.preflight = {
        id: event.preflightId,
        taskId: event.taskId,
        sessionId: task.sessionId,
        turn: task.turn,
        workspaceId: task.workspaceId,
        status: event.status,
        hits: event.hits,
        tokens: event.tokens,
        createdAt: event.at
      };
      break;
    }
    case "citation.added": {
      state.citations.push({
        id: event.citationId,
        taskId: event.taskId,
        knowledgeId: event.knowledgeId,
        version: event.version,
        purpose: event.purpose,
        createdAt: event.at
      });
      break;
    }
    case "proposal.created":
    case "proposal.committed": {
      state.proposalIds.add(event.proposalId);
      break;
    }
    case "task.closed": {
      const task = state.tasks.get(event.taskId);
      if (task === void 0) break;
      task.assessment = event.assessment;
      task.closedAt = event.at;
      break;
    }
    default:
      break;
  }
}

// src/store.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { readdir, readFile as readFile5, stat as stat3 } from "node:fs/promises";
import { basename as basename3, join as join5, relative, sep } from "node:path";

// src/frontmatter.ts
var import_yaml2 = __toESM(require_dist(), 1);
var KNOWLEDGE_ID_PATTERN = /^(?:DEC|CON|KNO|API|PRC|OQ|RUN|PLAY|AST)-\d{6}$/;
var PROPOSAL_ID_PATTERN = /^PRO-\d{6}$/;
var timestampSchema = external_exports.preprocess(
  (value) => value instanceof Date ? value.toISOString() : value,
  external_exports.string().refine(isIsoTimestamp, "expected an ISO 8601 timestamp with a timezone")
);
var appliesToSchema = external_exports.object({
  branches: external_exports.array(external_exports.string()).default([]),
  versions: external_exports.array(external_exports.string()).default([])
}).default({ branches: [], versions: [] });
var CURRENT_FORMAT = 1;
var knowledgeFrontmatterBase = external_exports.object({
  id: external_exports.string().regex(KNOWLEDGE_ID_PATTERN),
  type: external_exports.enum(KNOWLEDGE_TYPES),
  scope: external_exports.string().min(1),
  status: external_exports.enum(KNOWLEDGE_STATUSES),
  version: external_exports.number().int().positive(),
  title: external_exports.string().trim().min(1).max(200),
  summary: external_exports.string().trim().min(1).max(240),
  tags: external_exports.array(external_exports.string().trim().min(1).max(40)).max(12).default([]),
  source_refs: external_exports.array(external_exports.string().trim().min(1).max(500)).max(20).default([]),
  related: external_exports.array(external_exports.string()).default([]),
  supersedes: external_exports.array(external_exports.string()).default([]),
  superseded_by: external_exports.string().nullable().default(null),
  promoted_from: external_exports.string().nullable().default(null),
  applies_to: appliesToSchema,
  valid_from: timestampSchema.nullable().default(null),
  expires_at: timestampSchema.nullable().default(null),
  last_verified: timestampSchema.nullable().default(null),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deprecated_reason: external_exports.string().max(500).optional(),
  format: external_exports.number().int().positive().default(CURRENT_FORMAT)
}).passthrough();
var FUTURE_TOLERANCE_MS = 5 * 6e4;
var knowledgeFrontmatterSchema = knowledgeFrontmatterBase.superRefine((value, ctx) => {
  const validFrom = value.valid_from === null ? null : Date.parse(value.valid_from);
  const expiresAt = value.expires_at === null ? null : Date.parse(value.expires_at);
  if (validFrom !== null && expiresAt !== null && validFrom > expiresAt) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["expires_at"],
      message: "expires_at must not be earlier than valid_from"
    });
  }
  if (value.last_verified !== null) {
    const lastVerified = Date.parse(value.last_verified);
    if (lastVerified > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["last_verified"],
        message: "last_verified must not be in the future"
      });
    }
  }
});
var proposalFrontmatterBase = external_exports.object({
  id: external_exports.string().regex(PROPOSAL_ID_PATTERN),
  status: external_exports.enum(["pending", "committed", "rejected", "superseded"]),
  operation: external_exports.enum(["create", "update", "deprecate", "merge"]),
  type: external_exports.enum(KNOWLEDGE_TYPES),
  scope: external_exports.string().min(1),
  title: external_exports.string().trim().min(1).max(200),
  summary: external_exports.string().trim().min(1).max(240),
  tags: external_exports.array(external_exports.string().trim().min(1).max(40)).max(12).default([]),
  source_refs: external_exports.array(external_exports.string().trim().min(1).max(500)).max(20).default([]),
  related: external_exports.array(external_exports.string()).default([]),
  supersedes: external_exports.array(external_exports.string()).default([]),
  applies_to: appliesToSchema,
  promoted_from: external_exports.string().nullable().default(null),
  target: external_exports.string().nullable().default(null),
  expected_version: external_exports.number().int().positive().nullable().default(null),
  reason: external_exports.string().max(500).nullable().default(null),
  valid_from: timestampSchema.nullable().default(null),
  expires_at: timestampSchema.nullable().default(null),
  last_verified: timestampSchema.nullable().default(null),
  merged_ids: external_exports.array(external_exports.string()).max(10).default([]),
  task_id: external_exports.string().min(1),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  committed_to: external_exports.string().nullable().default(null)
}).passthrough();
var proposalFrontmatterSchema = proposalFrontmatterBase;
var KNOWLEDGE_KEYS = new Set(Object.keys(knowledgeFrontmatterBase.shape));
var PROPOSAL_KEYS = new Set(Object.keys(proposalFrontmatterBase.shape));
function splitFrontmatter(raw, path) {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    throw new MemoryError("INVALID_INPUT", `${path}: file must start with a YAML frontmatter block`);
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) {
    throw new MemoryError("INVALID_INPUT", `${path}: frontmatter block is not closed with ---`);
  }
  const source = match[1] ?? "";
  const body = raw.slice(match[0].length).replace(/\r\n/g, "\n").trim();
  let data;
  try {
    data = (0, import_yaml2.parse)(source);
  } catch (error) {
    throw new MemoryError("INVALID_INPUT", `${path}: invalid YAML frontmatter: ${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new MemoryError("INVALID_INPUT", `${path}: frontmatter must be a YAML mapping`);
  }
  return { data, body };
}
function pickExtra(data, known) {
  const extra = {};
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) extra[key] = value;
  }
  return extra;
}
function assertIdMatchesType(id, type, path) {
  const prefix = id.slice(0, id.indexOf("-"));
  if (PREFIX_TYPE[prefix] !== type) {
    throw new MemoryError("INVALID_INPUT", `${path}: id ${id} does not match type ${type}`);
  }
}
function quoteTimestampLines(yaml) {
  return yaml.split("\n").map((line) => {
    const match = /^(created_at|updated_at|valid_from|expires_at|last_verified):\s*(.*)$/.exec(line);
    if (!match) return line;
    const key = match[1] ?? "created_at";
    const value = (match[2] ?? "").replace(/^['"]|['"]$/g, "");
    return `${key}: '${value.replace(/'/g, "''")}'`;
  }).join("\n");
}
function parseKnowledgeFile(raw, path) {
  const { data, body } = splitFrontmatter(raw, path);
  const result = knowledgeFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
    throw new MemoryError("INVALID_INPUT", `${path}: invalid knowledge frontmatter: ${details}`);
  }
  const fm = result.data;
  if (fm.format > CURRENT_FORMAT) {
    throw new MemoryError(
      "INVALID_INPUT",
      `${path}: format ${fm.format} is newer than this version supports (${CURRENT_FORMAT}); upgrade Memory Hub instead of editing the file`
    );
  }
  assertIdMatchesType(fm.id, fm.type, path);
  if (!body) {
    throw new MemoryError("INVALID_INPUT", `${path}: body must not be empty`);
  }
  return {
    id: fm.id,
    type: fm.type,
    scope: parseScope(fm.scope),
    status: fm.status,
    version: fm.version,
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    sourceRefs: fm.source_refs,
    related: fm.related,
    supersedes: fm.supersedes,
    promotedFrom: fm.promoted_from,
    appliesTo: fm.applies_to,
    createdAt: fm.created_at,
    updatedAt: fm.updated_at,
    validFrom: fm.valid_from,
    expiresAt: fm.expires_at,
    lastVerified: fm.last_verified,
    supersededBy: fm.superseded_by,
    ...fm.deprecated_reason === void 0 ? {} : { deprecatedReason: fm.deprecated_reason },
    format: fm.format,
    body,
    path,
    extra: pickExtra(data, KNOWLEDGE_KEYS)
  };
}
function serializeKnowledgeFile(record) {
  const fm = {
    id: record.id,
    type: record.type,
    scope: formatScope(record.scope),
    status: record.status,
    version: record.version,
    title: record.title,
    summary: record.summary,
    tags: record.tags,
    source_refs: record.sourceRefs,
    related: record.related,
    supersedes: record.supersedes,
    ...record.supersededBy === null ? {} : { superseded_by: record.supersededBy },
    promoted_from: record.promotedFrom,
    applies_to: record.appliesTo,
    ...record.validFrom === null ? {} : { valid_from: record.validFrom },
    ...record.expiresAt === null ? {} : { expires_at: record.expiresAt },
    ...record.lastVerified === null ? {} : { last_verified: record.lastVerified },
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    ...record.deprecatedReason === void 0 ? {} : { deprecated_reason: record.deprecatedReason },
    format: record.format,
    ...record.extra
  };
  const yaml = quoteTimestampLines((0, import_yaml2.stringify)(fm, { lineWidth: 0 }).trimEnd());
  return `---
${yaml}
---

${record.body.trim()}
`;
}
function parseProposalFile(raw, path) {
  const { data, body } = splitFrontmatter(raw, path);
  const result = proposalFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
    throw new MemoryError("INVALID_INPUT", `${path}: invalid proposal frontmatter: ${details}`);
  }
  const fm = result.data;
  return {
    id: fm.id,
    status: fm.status,
    operation: fm.operation,
    type: fm.type,
    scope: parseScope(fm.scope),
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    sourceRefs: fm.source_refs,
    related: fm.related,
    supersedes: fm.supersedes,
    appliesTo: fm.applies_to,
    promotedFrom: fm.promoted_from,
    target: fm.target,
    expectedVersion: fm.expected_version,
    reason: fm.reason,
    validFrom: fm.valid_from,
    expiresAt: fm.expires_at,
    lastVerified: fm.last_verified,
    mergedIds: fm.merged_ids,
    taskId: fm.task_id,
    createdAt: fm.created_at,
    updatedAt: fm.updated_at,
    committedTo: fm.committed_to,
    body,
    path,
    extra: pickExtra(data, PROPOSAL_KEYS)
  };
}
function serializeProposalFile(record) {
  const fm = {
    id: record.id,
    status: record.status,
    operation: record.operation,
    type: record.type,
    scope: formatScope(record.scope),
    title: record.title,
    summary: record.summary,
    tags: record.tags,
    source_refs: record.sourceRefs,
    related: record.related,
    supersedes: record.supersedes,
    applies_to: record.appliesTo,
    promoted_from: record.promotedFrom,
    target: record.target,
    expected_version: record.expectedVersion,
    reason: record.reason,
    ...record.mergedIds.length === 0 ? {} : { merged_ids: record.mergedIds },
    ...record.validFrom === null ? {} : { valid_from: record.validFrom },
    ...record.expiresAt === null ? {} : { expires_at: record.expiresAt },
    ...record.lastVerified === null ? {} : { last_verified: record.lastVerified },
    task_id: record.taskId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    committed_to: record.committedTo,
    ...record.extra
  };
  const yaml = quoteTimestampLines((0, import_yaml2.stringify)(fm, { lineWidth: 0 }).trimEnd());
  const body = record.body.trim();
  return `---
${yaml}
---
${body ? `
${body}
` : ""}`;
}

// src/temporal.ts
var DEFAULT_TEMPORAL_POLICY = {
  aging_days: 90,
  aging_decay: 0.85,
  stale_decay: 0.6,
  scheduled_decay: 0.3
};
var DAY_MS = 864e5;
function parseTime(value) {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function temporalTimesOf(record) {
  return {
    validFrom: parseTime(record.validFrom),
    expiresAt: parseTime(record.expiresAt),
    lastVerified: parseTime(record.lastVerified),
    updatedAt: parseTime(record.updatedAt)
  };
}
function temporalState(record, nowMs, policy = DEFAULT_TEMPORAL_POLICY) {
  return temporalStateFromTimes(temporalTimesOf(record), nowMs, policy);
}
function temporalStateFromTimes(times, nowMs, policy = DEFAULT_TEMPORAL_POLICY) {
  if (times.expiresAt !== null && nowMs >= times.expiresAt) return "stale";
  if (times.validFrom !== null && nowMs < times.validFrom) return "scheduled";
  const lastVerified = times.lastVerified ?? times.updatedAt;
  if (lastVerified !== null && nowMs - lastVerified >= policy.aging_days * DAY_MS) return "aging";
  return "fresh";
}
function temporalDecay(state, policy = DEFAULT_TEMPORAL_POLICY) {
  switch (state) {
    case "stale":
      return policy.stale_decay;
    case "aging":
      return policy.aging_decay;
    case "scheduled":
      return policy.scheduled_decay;
    case "fresh":
      return 1;
  }
}
function temporalAnnotation(record, state, policy = DEFAULT_TEMPORAL_POLICY) {
  if (state === "stale") return `\u9700\u590D\u6838\uFF1A\u5DF2\u4E8E ${record.expiresAt ?? "\u672A\u77E5"} \u5230\u671F`;
  if (state === "scheduled") return `\u5C1A\u672A\u751F\u6548\uFF1A\u81EA ${record.validFrom ?? "\u672A\u77E5"} \u8D77`;
  if (state === "aging") {
    const basis = record.lastVerified ?? record.updatedAt;
    return `\u957F\u671F\u672A\u786E\u8BA4\uFF1A\u4E0A\u6B21\u786E\u8BA4 ${basis}\uFF08\u9608\u503C ${policy.aging_days} \u5929\uFF09`;
  }
  return null;
}

// src/search.ts
var HAN = new RegExp("\\p{Script=Han}", "u");
var WORD = /[\p{Script=Han}]+|[a-z0-9][a-z0-9_]*/gu;
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
  "\u7684",
  "\u4E86",
  "\u662F",
  "\u5728",
  "\u548C",
  "\u4E0E",
  "\u53CA",
  "\u6216",
  "\u628A",
  "\u88AB",
  "\u5BF9",
  "\u4E2A",
  "\u8FD9",
  "\u90A3"
]);
function normalizeText(text) {
  return text.normalize("NFKC").toLowerCase();
}
function tokenize(text) {
  const normalized = normalizeText(text);
  const tokens = [];
  for (const match of normalized.matchAll(WORD)) {
    const chunk = match[0];
    if (chunk.length === 0) continue;
    if (HAN.test(chunk)) {
      const chars = Array.from(chunk);
      for (const char of chars) {
        if (!STOPWORDS.has(char)) tokens.push(char);
      }
      for (let index = 0; index + 1 < chars.length; index += 1) {
        const bigram = `${chars[index]}${chars[index + 1]}`;
        if (!STOPWORDS.has(bigram)) tokens.push(bigram);
      }
    } else if (!STOPWORDS.has(chunk)) {
      tokens.push(chunk);
    }
  }
  return tokens;
}
function countTokens(tokens) {
  const counts = /* @__PURE__ */ new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}
function indexEntryOf(record) {
  const tokens = countTokens([
    ...tokenize(record.title),
    ...tokenize(record.title),
    ...tokenize(record.title),
    ...tokenize(record.tags.join(" ")),
    ...tokenize(record.tags.join(" ")),
    ...tokenize(record.summary),
    ...tokenize(record.summary),
    ...tokenize(record.body)
  ]);
  return {
    record,
    length: [...tokens.values()].reduce((sum, value) => sum + value, 0),
    tokens,
    times: temporalTimesOf(record),
    titleNormalized: normalizeText(record.title)
  };
}
var TYPE_BOOST = {
  constraint: 1.2,
  decision: 1.15,
  "runtime-base": 1.1,
  "api-catalog": 1.05,
  process: 1.05,
  knowledge: 1,
  playbooks: 0.95,
  "open-questions": 0.85,
  assets: 0.8
};
var K1 = 1.2;
var B = 0.75;
var KnowledgeIndex = class {
  entries = /* @__PURE__ */ new Map();
  postings = /* @__PURE__ */ new Map();
  totalLength = 0;
  get size() {
    return this.entries.size;
  }
  add(record) {
    if (this.entries.has(record.id)) this.remove(record.id);
    const entry = indexEntryOf(record);
    this.entries.set(record.id, entry);
    this.totalLength += entry.length;
    for (const [token, count] of entry.tokens) {
      let posting = this.postings.get(token);
      if (posting === void 0) {
        posting = /* @__PURE__ */ new Map();
        this.postings.set(token, posting);
      }
      posting.set(record.id, count);
    }
  }
  remove(id) {
    const entry = this.entries.get(id);
    if (entry === void 0) return;
    this.totalLength -= entry.length;
    for (const token of entry.tokens.keys()) {
      const posting = this.postings.get(token);
      if (posting === void 0) continue;
      posting.delete(id);
      if (posting.size === 0) this.postings.delete(token);
    }
    this.entries.delete(id);
  }
  clear() {
    this.entries.clear();
    this.postings.clear();
    this.totalLength = 0;
  }
  get(id) {
    return this.entries.get(id)?.record;
  }
  records() {
    return [...this.entries.values()].map((entry) => entry.record);
  }
  search(query, filters) {
    return rankHits(query, filters, {
      entryCount: this.entries.size,
      totalLength: this.totalLength,
      postings: (token) => this.postings.get(token),
      entry: (id) => this.entries.get(id)
    });
  }
};
function queryTokensOf(query) {
  return [...new Set(tokenize(query))];
}
function searchSetup(query, filters, entryCount, totalLength) {
  return {
    entryCount,
    avgLength: totalLength / Math.max(1, entryCount),
    policy: filters.temporal ?? DEFAULT_TEMPORAL_POLICY,
    nowMs: filters.nowMs ?? Date.now(),
    normalizedQuery: normalizeText(query).trim(),
    statuses: filters.statuses ?? /* @__PURE__ */ new Set(["accepted"])
  };
}
function bm25Term(tf, df, entryCount, length, avgLength) {
  const idf = Math.log(1 + (entryCount - df + 0.5) / (df + 0.5));
  const denominator = tf + K1 * (1 - B + B * (length / Math.max(1, avgLength)));
  return idf * (tf * (K1 + 1)) / Math.max(1e-6, denominator);
}
function passesFilters(record, filters, setup) {
  if (!setup.statuses.has(record.status)) return false;
  if (!isScopeVisible(record.scope, filters.visibility)) return false;
  if (filters.types !== void 0 && !filters.types.has(record.type)) return false;
  return true;
}
function rankScored(filters, setup, queryTokens, scored) {
  const limit = Math.max(1, filters.limit ?? 8);
  const best = [];
  for (const { entry, baseScore } of scored) {
    const record = entry.record;
    if (!passesFilters(record, filters, setup)) continue;
    const state = temporalStateFromTimes(entry.times, setup.nowMs, setup.policy);
    if (filters.excludeTemporal?.has(state) === true) continue;
    const updatedAt = entry.times.updatedAt;
    const ageDays2 = updatedAt === null ? 0 : Math.max(0, (setup.nowMs - updatedAt) / 864e5);
    let score = baseScore * TYPE_BOOST[record.type] + Math.exp(-ageDays2 / 180) * 0.3;
    score *= temporalDecay(state, setup.policy);
    if (setup.normalizedQuery.length >= 2 && entry.titleNormalized.includes(setup.normalizedQuery)) {
      score *= 1.25;
    }
    if (filters.preferProject !== void 0 && record.scope.level === "project" && record.scope.workspaceId === filters.preferProject) {
      score *= filters.localBoost ?? 1;
    }
    if (filters.minScore !== void 0 && score < filters.minScore) continue;
    offerTop(best, { id: record.id, score, temporal: state, entry }, limit);
  }
  best.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.id.localeCompare(left.id);
  });
  return best.map((candidate) => {
    const record = candidate.entry.record;
    return {
      id: record.id,
      version: record.version,
      type: record.type,
      status: record.status,
      scope: record.scope,
      title: record.title,
      summary: record.summary,
      path: record.path,
      snippet: makeSnippet(record, queryTokens),
      score: candidate.score,
      temporal: candidate.temporal,
      core: filters.coreTag ?? null
    };
  });
}
function rankHits(query, filters, source) {
  const queryTokens = queryTokensOf(query);
  if (queryTokens.length === 0) return [];
  const setup = searchSetup(query, filters, source.entryCount, source.totalLength);
  const scores = /* @__PURE__ */ new Map();
  for (const token of queryTokens) {
    const posting = source.postings(token);
    if (posting === void 0) continue;
    const df = posting.size;
    for (const [id, tf] of posting) {
      const entry = source.entry(id);
      if (entry === void 0) continue;
      if (!passesFilters(entry.record, filters, setup)) continue;
      const term = bm25Term(tf, df, source.entryCount, entry.length, setup.avgLength);
      scores.set(id, (scores.get(id) ?? 0) + term);
    }
  }
  return rankScored(
    filters,
    setup,
    queryTokens,
    (function* scored() {
      for (const [id, baseScore] of scores) {
        const entry = source.entry(id);
        if (entry !== void 0) yield { entry, baseScore };
      }
    })()
  );
}
function ranksBefore(left, right) {
  if (left.score !== right.score) return left.score > right.score;
  return left.id > right.id;
}
function offerTop(best, candidate, limit) {
  if (best.length < limit) {
    best.push(candidate);
    return;
  }
  let worst = 0;
  for (let index = 1; index < best.length; index += 1) {
    if (ranksBefore(best[worst], best[index])) worst = index;
  }
  if (ranksBefore(candidate, best[worst])) best[worst] = candidate;
}
function makeSnippet(record, queryTokens) {
  if (record.summary.trim().length > 0) return record.summary.trim();
  const lines = record.body.split("\n");
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (queryTokens.some((token) => normalized.includes(token))) {
      return line.trim().slice(0, 240);
    }
  }
  return record.body.trim().slice(0, 240);
}

// src/index-sqlite.ts
import { mkdir as mkdir2 } from "node:fs/promises";
import { dirname as dirname4 } from "node:path";
var SQLITE_INDEX_FORMAT = 1;
var DEFAULT_CANDIDATE_LIMIT = 5e3;
var SCHEMA = `
CREATE TABLE IF NOT EXISTS docs (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  length INTEGER NOT NULL,
  tokens TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_ms INTEGER,
  valid_from_ms INTEGER,
  expires_at_ms INTEGER,
  last_verified_ms INTEGER,
  title_norm TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS terms (
  token TEXT PRIMARY KEY,
  df INTEGER NOT NULL
) WITHOUT ROWID;
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  tokens,
  content='',
  tokenize='unicode61'
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS docs_status ON docs(status);
`;
function countOccurrences(haystack, needle) {
  let count = 0;
  let position = haystack.indexOf(needle);
  while (position !== -1) {
    count += 1;
    position = haystack.indexOf(needle, position + needle.length - 1);
  }
  return count;
}
function tokenTextOf(tokens) {
  const parts = [];
  for (const [token, count] of tokens) {
    for (let index = 0; index < count; index += 1) parts.push(token);
  }
  return parts.join(" ");
}
var SqliteIndex = class _SqliteIndex {
  constructor(db, options) {
    this.db = db;
    this.options = options;
    this.candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
    this.stmts = {
      insertDoc: db.prepare(
        "INSERT INTO docs(id, length, tokens, type, status, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      insertFts: db.prepare("INSERT INTO docs_fts(rowid, tokens) VALUES (?, ?)"),
      deleteFts: db.prepare("INSERT INTO docs_fts(docs_fts, rowid, tokens) VALUES ('delete', ?, ?)"),
      deleteDoc: db.prepare("DELETE FROM docs WHERE rowid = ?"),
      docByRowid: db.prepare(
        "SELECT rowid, id, length, tokens, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm FROM docs WHERE rowid = ?"
      ),
      docById: db.prepare(
        "SELECT rowid, id, length, tokens, updated_ms, valid_from_ms, expires_at_ms, last_verified_ms, title_norm FROM docs WHERE id = ?"
      ),
      lastRowid: db.prepare("SELECT last_insert_rowid() AS rowid"),
      termDf: db.prepare("SELECT df FROM terms WHERE token = ?"),
      termInc: db.prepare("INSERT INTO terms(token, df) VALUES (?, 1) ON CONFLICT(token) DO UPDATE SET df = df + 1"),
      termDec: db.prepare("UPDATE terms SET df = df - 1 WHERE token = ?"),
      termPrune: db.prepare("DELETE FROM terms WHERE token = ? AND df <= 0"),
      metaGet: db.prepare("SELECT value FROM meta WHERE key = ?"),
      metaSet: db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)"),
      deleteAllDocs: db.prepare("DELETE FROM docs"),
      deleteAllTerms: db.prepare("DELETE FROM terms")
    };
  }
  entryCount = 0;
  totalLength = 0;
  inTransaction = false;
  /** 最近一次检索实际取到的候选数，用于诊断与基准。 */
  lastCandidateCount = 0;
  candidateLimit;
  stmts;
  get size() {
    return this.entryCount;
  }
  /**
   * 打开（必要时重建）索引。`node:sqlite` 不可用的运行时直接返回原因，由调用方
   * 回退内存索引——这条路径不能影响启动。
   */
  static async open(options) {
    let DatabaseSync;
    try {
      const module = await import("node:sqlite");
      DatabaseSync = module.DatabaseSync;
    } catch {
      return { reason: "node:sqlite is not available in this Node.js runtime" };
    }
    if (DatabaseSync === void 0) return { reason: "node:sqlite did not export DatabaseSync" };
    let db = null;
    try {
      await mkdir2(dirname4(options.path), { recursive: true });
      db = new DatabaseSync(options.path);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA synchronous = NORMAL");
      db.exec(SCHEMA);
    } catch (error) {
      try {
        db?.close();
      } catch {
      }
      return { reason: `cannot open ${options.path}: ${error.message}` };
    }
    if (db === null) return { reason: `cannot open ${options.path}` };
    const index = new _SqliteIndex(db, options);
    try {
      const format = index.getMeta("format_version");
      const fingerprint = index.getMeta("fingerprint");
      const count = Number(index.getMeta("entry_count") ?? "0");
      const totalLength = Number(index.getMeta("total_length") ?? "0");
      const reusable = format === String(SQLITE_INDEX_FORMAT) && fingerprint === options.fingerprint && Number.isFinite(count) && Number.isFinite(totalLength);
      if (reusable) {
        index.entryCount = count;
        index.totalLength = totalLength;
        return { index, rebuilt: false };
      }
      index.reset();
      return { index, rebuilt: true };
    } catch (error) {
      try {
        db.exec("DROP TABLE IF EXISTS docs; DROP TABLE IF EXISTS terms; DROP TABLE IF EXISTS docs_fts; DROP TABLE IF EXISTS meta");
        db.exec(SCHEMA);
        index.reset();
        return { index, rebuilt: true };
      } catch {
        return { reason: `index is unusable and cannot be rebuilt: ${error.message}` };
      }
    }
  }
  add(record) {
    const entry = indexEntryOf(record);
    this.transaction(() => this.insertEntry(record, entry, true));
  }
  remove(id) {
    const row = this.stmts.docById.get(id);
    if (row === void 0) return;
    this.transaction(() => this.deleteEntry(row, true));
  }
  clear() {
    this.transaction(() => {
      const rows = this.db.prepare("SELECT rowid, tokens FROM docs").all();
      for (const row of rows) this.stmts.deleteFts.run(row.rowid, row.tokens);
      this.stmts.deleteAllDocs.run();
      this.stmts.deleteAllTerms.run();
      this.entryCount = 0;
      this.totalLength = 0;
      this.writeCounters();
    });
  }
  /** 重建时把整批写入包在一个事务里：df 在内存累计后一次性写入。 */
  async rebuild(records) {
    this.reset();
    const df = /* @__PURE__ */ new Map();
    this.db.exec("BEGIN");
    this.inTransaction = true;
    try {
      for await (const record of records) {
        const entry = indexEntryOf(record);
        this.insertEntry(record, entry, false);
        for (const token of entry.tokens.keys()) df.set(token, (df.get(token) ?? 0) + 1);
      }
      this.writeDf(df);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
  /** 启动加载完成后写入本次观测到的指纹，供下次启动判断是否需要重建。 */
  setFingerprint(fingerprint) {
    this.transaction(() => {
      this.writeMeta("fingerprint", fingerprint);
      this.writeMeta("format_version", String(SQLITE_INDEX_FORMAT));
      this.writeMeta("built_at", nowIso());
      this.writeCounters();
    });
  }
  search(query, filters) {
    const tokens = queryTokensOf(query);
    if (tokens.length === 0) return [];
    const setup = searchSetup(query, filters, this.entryCount, this.totalLength);
    const df = /* @__PURE__ */ new Map();
    for (const token of tokens) df.set(token, this.termDf(token));
    const rows = this.candidates(tokens, filters);
    const needles = tokens.map((token) => ` ${token} `);
    const self = this;
    return rankScored(
      filters,
      setup,
      tokens,
      (function* scored() {
        for (const row of rows) {
          const entry = self.entryOf(row);
          if (entry === void 0) continue;
          const padded = ` ${row.tokens} `;
          let baseScore = 0;
          for (const [position, token] of tokens.entries()) {
            const termDf = df.get(token) ?? 0;
            if (termDf === 0) continue;
            const tf = countOccurrences(padded, needles[position]);
            if (tf === 0) continue;
            baseScore += bm25Term(tf, termDf, self.entryCount, row.length, setup.avgLength);
          }
          yield { entry, baseScore };
        }
      })()
    );
  }
  close() {
    this.db.close();
  }
  /** FTS5 只负责取候选：状态/类型过滤 + bm25 取前 N 条 rowid，再回表一次。 */
  candidates(tokens, filters) {
    const match = tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");
    const statuses = [...filters.statuses ?? /* @__PURE__ */ new Set(["accepted"])];
    const params = [match, this.candidateLimit];
    let sql = `SELECT d.rowid, d.id, d.length, d.tokens, d.updated_ms, d.valid_from_ms, d.expires_at_ms, d.last_verified_ms, d.title_norm FROM docs d JOIN (SELECT rowid FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?) m ON m.rowid = d.rowid WHERE d.status IN (${statuses.map(() => "?").join(", ")})`;
    params.push(...statuses);
    if (filters.types !== void 0 && filters.types.size > 0) {
      const types = [...filters.types];
      sql += ` AND d.type IN (${types.map(() => "?").join(", ")})`;
      params.push(...types);
    }
    const rows = this.db.prepare(sql).all(...params);
    this.lastCandidateCount = rows.length;
    return rows;
  }
  insertEntry(record, entry, trackDf) {
    const previous = this.stmts.docById.get(record.id);
    if (previous !== void 0) this.deleteEntry(previous, trackDf);
    const tokenText = tokenTextOf(entry.tokens);
    this.stmts.insertDoc.run(
      record.id,
      entry.length,
      tokenText,
      record.type,
      record.status,
      entry.times.updatedAt,
      entry.times.validFrom,
      entry.times.expiresAt,
      entry.times.lastVerified,
      entry.titleNormalized
    );
    const rowid = Number(this.stmts.lastRowid.get().rowid);
    this.stmts.insertFts.run(rowid, tokenText);
    if (trackDf) {
      for (const token of entry.tokens.keys()) this.stmts.termInc.run(token);
    }
    this.entryCount += 1;
    this.totalLength += entry.length;
    this.writeCounters();
  }
  deleteEntry(row, trackDf) {
    this.stmts.deleteFts.run(row.rowid, row.tokens);
    this.stmts.deleteDoc.run(row.rowid);
    if (trackDf) {
      for (const token of new Set(row.tokens.split(" "))) {
        this.stmts.termDec.run(token);
        this.stmts.termPrune.run(token);
      }
    }
    this.entryCount = Math.max(0, this.entryCount - 1);
    this.totalLength = Math.max(0, this.totalLength - row.length);
    this.writeCounters();
  }
  writeDf(df) {
    const entries = [...df.entries()];
    for (let index = 0; index < entries.length; index += 500) {
      const chunk = entries.slice(index, index + 500);
      const placeholders = chunk.map(() => "(?, ?)").join(", ");
      this.db.prepare(`INSERT OR REPLACE INTO terms(token, df) VALUES ${placeholders}`).run(...chunk.flat());
    }
  }
  entryOf(row) {
    const record = this.options.recordOf(row.id);
    if (record === void 0) return void 0;
    return {
      record,
      length: row.length,
      tokens: /* @__PURE__ */ new Map(),
      times: {
        updatedAt: row.updated_ms,
        validFrom: row.valid_from_ms,
        expiresAt: row.expires_at_ms,
        lastVerified: row.last_verified_ms
      },
      titleNormalized: row.title_norm
    };
  }
  termDf(token) {
    const row = this.stmts.termDf.get(token);
    return row?.df ?? 0;
  }
  transaction(fn) {
    if (this.inTransaction) {
      fn();
      return;
    }
    this.db.exec("BEGIN");
    this.inTransaction = true;
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
  reset() {
    this.stmts.deleteAllDocs.run();
    this.stmts.deleteAllTerms.run();
    this.db.exec("INSERT INTO docs_fts(docs_fts) VALUES('delete-all')");
    this.entryCount = 0;
    this.totalLength = 0;
    this.writeMeta("format_version", String(SQLITE_INDEX_FORMAT));
    this.writeMeta("entry_count", "0");
    this.writeMeta("total_length", "0");
  }
  writeCounters() {
    this.writeMeta("entry_count", String(this.entryCount));
    this.writeMeta("total_length", String(this.totalLength));
  }
  getMeta(key) {
    const row = this.stmts.metaGet.get(key);
    return row?.value;
  }
  writeMeta(key, value) {
    this.stmts.metaSet.run(key, value);
  }
};

// src/store.ts
var FUTURE_TOLERANCE_MS2 = 5 * 6e4;
function temporalValueOf(value, field) {
  if (value === void 0) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!isIsoTimestamp(trimmed)) {
    throw new MemoryError("INVALID_INPUT", `${field} must be an ISO 8601 timestamp with timezone`);
  }
  return trimmed;
}
function assertTemporalWindow(validFrom, expiresAt, lastVerified) {
  if (validFrom !== null && expiresAt !== null && Date.parse(validFrom) > Date.parse(expiresAt)) {
    throw new MemoryError("INVALID_INPUT", "expires_at must not be earlier than valid_from");
  }
  if (lastVerified !== null && Date.parse(lastVerified) > Date.now() + FUTURE_TOLERANCE_MS2) {
    throw new MemoryError("INVALID_INPUT", "last_verified must not be in the future");
  }
}
var EMPTY_APPLIES = { branches: [], versions: [] };
function isUnder(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !rel.includes(`..${sep}`);
}
function sequenceOf(id) {
  const tail = id.slice(id.lastIndexOf("-") + 1);
  const value = Number.parseInt(tail, 10);
  return Number.isFinite(value) ? value : 0;
}
var PENDING_EAGER_LIMIT = 200;
var KnowledgeStore = class {
  constructor(hub, ledger) {
    this.hub = hub;
    this.ledger = ledger;
  }
  /** 检索后端：默认内存索引；条目多且 node:sqlite 可用时换成派生 SQLite 索引。 */
  index = new KnowledgeIndex();
  indexBackend = "memory";
  /** 本次启动是否重建了派生索引（false = 复用了上次的库）。 */
  indexRebuilt = false;
  /** 请求 SQLite 但不可用/只读时的说明；会进入 diagnostics。 */
  indexWarning = null;
  docs = /* @__PURE__ */ new Map();
  proposals = /* @__PURE__ */ new Map();
  /** 超出预解析上限的 pending/ 文件：先记路径，打开或审批时再解析（见 getProposal）。 */
  pendingBacklog = /* @__PURE__ */ new Map();
  diagnostics = [];
  sequences = {};
  async load() {
    this.closeIndex();
    this.docs.clear();
    this.proposals.clear();
    this.pendingBacklog.clear();
    this.diagnostics.length = 0;
    this.sequences = {};
    this.index = new KnowledgeIndex();
    this.indexBackend = "memory";
    this.indexRebuilt = false;
    this.indexWarning = null;
    const knowledgeFiles = [];
    let knowledgeCount = 0;
    for (const type of Object.keys(TYPE_PREFIX)) {
      const dir = this.hub.knowledgeDir(type);
      const files = (await readdirSafe(dir)).filter((file) => file.endsWith(".md"));
      knowledgeFiles.push({ type, dir, files });
      knowledgeCount += files.length;
    }
    const storage = this.hub.config.storage;
    const wantsSqlite = storage.index === "sqlite" || storage.index === "auto" && knowledgeCount >= storage.sqlite_min_entries;
    const fingerprint = await this.knowledgeFingerprint(knowledgeCount);
    if (wantsSqlite) {
      if (this.hub.readOnly) {
        this.indexWarning = "read-only hub: the derived SQLite index is disabled";
      } else {
        const outcome = await SqliteIndex.open({
          path: this.hub.indexPath(),
          recordOf: (id) => this.docs.get(id),
          fingerprint,
          candidateLimit: storage.index_candidate_limit
        });
        if ("reason" in outcome) {
          this.indexWarning = `sqlite index unavailable (${outcome.reason}); using the memory index`;
        } else {
          this.index = outcome.index;
          this.indexBackend = "sqlite";
          this.indexRebuilt = outcome.rebuilt;
        }
      }
    }
    const parsed = [];
    for (const { type, dir, files } of knowledgeFiles) {
      for (const file of files) {
        const path = join5(dir, file);
        try {
          const record = parseKnowledgeFile(await readFile5(path, "utf8"), path);
          if (record.type !== type) {
            throw new MemoryError("INVALID_INPUT", `${path}: type ${record.type} is stored in ${type}/`);
          }
          if (this.docs.has(record.id)) {
            this.diagnostics.push({ path, message: `duplicate knowledge id ${record.id}; keeping the first file` });
            continue;
          }
          this.docs.set(record.id, record);
          parsed.push(record);
          this.bumpSequence(TYPE_PREFIX[type], sequenceOf(record.id));
        } catch (error) {
          this.diagnostics.push({ path, message: error.message });
        }
      }
    }
    if (this.indexBackend === "sqlite") {
      const sqlite = this.index;
      if (this.indexRebuilt) {
        await sqlite.rebuild(
          (async function* records() {
            yield* parsed;
          })()
        );
      }
      sqlite.setFingerprint(await this.knowledgeFingerprint(this.docs.size));
    } else {
      for (const record of parsed) this.index.add(record);
    }
    if (this.indexWarning !== null) {
      this.diagnostics.push({ path: this.hub.indexPath(), message: this.indexWarning });
    }
    const pendingFiles = (await readdirSafe(this.hub.pendingDir())).filter((file) => file.endsWith(".md") && PROPOSAL_ID_PATTERN.test(file.slice(0, -3))).sort((left, right) => right.localeCompare(left));
    for (const [index, file] of pendingFiles.entries()) {
      const id = file.slice(0, -3);
      const path = join5(this.hub.pendingDir(), file);
      if (index >= PENDING_EAGER_LIMIT) {
        this.pendingBacklog.set(id, path);
        this.bumpSequence("PRO", sequenceOf(id));
        continue;
      }
      try {
        const proposal = parseProposalFile(await readFile5(path, "utf8"), path);
        this.proposals.set(proposal.id, proposal);
        this.bumpSequence("PRO", sequenceOf(proposal.id));
      } catch (error) {
        this.diagnostics.push({ path, message: error.message });
      }
    }
    const sequenceRaw = await readTextOrNull(this.hub.sequencesPath());
    if (sequenceRaw !== null) {
      try {
        const parsed2 = JSON.parse(sequenceRaw);
        for (const [key, value] of Object.entries(parsed2)) {
          if (typeof value === "number" && Number.isFinite(value)) {
            this.sequences[key] = Math.max(this.sequences[key] ?? 0, value);
          }
        }
      } catch (error) {
        this.diagnostics.push({ path: this.hub.sequencesPath(), message: `invalid sequences.json: ${error.message}` });
      }
    }
  }
  records() {
    return [...this.docs.values()];
  }
  /** 释放派生索引句柄（SQLite 文件在 Windows 上不关闭就无法删除/移动）。 */
  closeIndex() {
    if (this.index instanceof SqliteIndex) {
      try {
        this.index.close();
      } catch {
      }
    }
  }
  async get(id, version) {
    const current = this.docs.get(id);
    if (version === void 0 || current !== void 0 && current.version === version) {
      return current ?? null;
    }
    const prefix = id.slice(0, id.indexOf("-"));
    const type = PREFIX_TYPE[prefix];
    if (type === void 0) return null;
    const historyPath = this.hub.historyPath(type, id, version);
    const raw = await readTextOrNull(historyPath);
    if (raw === null) return null;
    try {
      return parseKnowledgeFile(raw, historyPath);
    } catch {
      return null;
    }
  }
  search(query, options) {
    return this.index.search(query, options);
  }
  getProposal(id) {
    const cached = this.proposals.get(id);
    if (cached !== void 0) return cached;
    const path = this.pendingBacklog.get(id);
    if (path === void 0) return null;
    try {
      const proposal = parseProposalFile(readFileSync2(path, "utf8"), path);
      this.proposals.set(proposal.id, proposal);
      this.pendingBacklog.delete(id);
      return proposal;
    } catch (error) {
      this.pendingBacklog.delete(id);
      this.diagnostics.push({ path, message: error.message });
      return null;
    }
  }
  pendingForTask(taskId) {
    return [...this.proposals.values()].filter((proposal) => proposal.taskId === taskId && proposal.status === "pending");
  }
  counts() {
    const byStatus = {
      candidate: 0,
      accepted: 0,
      rejected: 0,
      superseded: 0,
      deprecated: 0
    };
    const byType = {};
    for (const record of this.docs.values()) {
      byStatus[record.status] += 1;
      byType[record.type] = (byType[record.type] ?? 0) + 1;
    }
    return {
      knowledge: this.docs.size,
      pending: this.pendingBacklog.size + [...this.proposals.values()].filter((proposal) => proposal.status === "pending").length,
      byStatus,
      byType
    };
  }
  async propose(input, options) {
    await this.assertWritable();
    const now = nowIso();
    const title = input.title.trim();
    const summary = input.summary.trim();
    const body = (input.content ?? "").trim();
    if (title.length === 0 || title.length > 200) {
      throw new MemoryError("INVALID_INPUT", "title must be 1..200 characters");
    }
    if (summary.length === 0 || summary.length > 240) {
      throw new MemoryError("INVALID_INPUT", "summary must be 1..240 characters");
    }
    if (body.length === 0 && input.operation !== "deprecate") {
      throw new MemoryError("INVALID_INPUT", "content is required for create/update proposals");
    }
    if (Buffer.byteLength(body, "utf8") > this.hub.config.policy.limits.max_body_bytes) {
      throw new MemoryError("INVALID_INPUT", `content exceeds ${this.hub.config.policy.limits.max_body_bytes} bytes`);
    }
    const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 12) throw new MemoryError("INVALID_INPUT", "at most 12 tags are allowed");
    const sourceRefs = (input.sourceRefs ?? []).map((ref) => ref.trim()).filter(Boolean);
    if (sourceRefs.length > this.hub.config.policy.limits.max_source_refs) {
      throw new MemoryError("INVALID_INPUT", `at most ${this.hub.config.policy.limits.max_source_refs} source_refs are allowed`);
    }
    for (const ref of sourceRefs) {
      if (!/^(?:session:[^\s#]+#\d+-\d+|file:.+|url:https?:\/\/\S+|note:.+)$/.test(ref)) {
        throw new MemoryError("INVALID_INPUT", `unsupported source_ref "${ref}" (use session:, file:, url:, or note:)`);
      }
    }
    const scope = parseScope(input.scope);
    const validFrom = temporalValueOf(input.validFrom, "valid_from");
    const expiresAt = temporalValueOf(input.expiresAt, "expires_at");
    const lastVerified = temporalValueOf(input.lastVerified, "last_verified");
    assertTemporalWindow(validFrom, expiresAt, lastVerified);
    if (input.operation !== "create") {
      if (input.target === void 0 || input.target === "") {
        throw new MemoryError("INVALID_INPUT", `${input.operation} requires target`);
      }
      if (input.expectedVersion === void 0) {
        throw new MemoryError("INVALID_INPUT", `${input.operation} requires expected_version`);
      }
      const target = this.docs.get(input.target);
      if (target === void 0) {
        throw new MemoryError("NOT_FOUND", `target ${input.target} does not exist`);
      }
      if (target.status !== "accepted") {
        throw new MemoryError("INVALID_STATE", `target ${input.target} is ${target.status}`);
      }
      if (target.version !== input.expectedVersion) {
        throw new MemoryError("VERSION_CONFLICT", `target ${input.target} is at version ${target.version}, expected ${input.expectedVersion}`);
      }
      if (formatScope(target.scope) !== formatScope(scope)) {
        throw new MemoryError("SCOPE_FORBIDDEN", "target scope does not match proposal scope");
      }
      if (input.operation === "deprecate" && (input.reason === void 0 || input.reason.trim() === "")) {
        throw new MemoryError("INVALID_INPUT", "deprecate requires a reason");
      }
    }
    if (input.supersedes !== void 0 && input.supersedes.length > 0 && input.operation !== "create") {
      throw new MemoryError("INVALID_INPUT", "supersedes is only supported for create");
    }
    for (const oldId of input.supersedes ?? []) {
      const old = this.docs.get(oldId);
      if (old === void 0 || old.status !== "accepted") {
        throw new MemoryError("INVALID_STATE", `supersedes target ${oldId} is not an accepted knowledge entry`);
      }
    }
    const rawMergedIds = (input.mergedIds ?? []).map((value) => value.trim()).filter(Boolean);
    if (new Set(rawMergedIds).size !== rawMergedIds.length) {
      throw new MemoryError("INVALID_INPUT", "merged_ids must not contain duplicates");
    }
    const mergedIds = [...new Set(rawMergedIds)];
    if (input.operation !== "merge") {
      if (mergedIds.length > 0) {
        throw new MemoryError("INVALID_INPUT", "merged_ids is only supported for merge");
      }
    } else {
      if (mergedIds.length === 0) {
        throw new MemoryError("INVALID_INPUT", "merge requires merged_ids");
      }
      if (mergedIds.length > 10) {
        throw new MemoryError("INVALID_INPUT", "merge supports at most 10 merged_ids");
      }
      if (input.target === void 0 || input.target === "") {
        throw new MemoryError("INVALID_INPUT", "merge requires target");
      }
      const target = this.docs.get(input.target);
      if (target === void 0) {
        throw new MemoryError("NOT_FOUND", `target ${input.target} does not exist`);
      }
      if (mergedIds.includes(target.id)) {
        throw new MemoryError("INVALID_INPUT", "merged_ids must not contain the target");
      }
      for (const mergedId of mergedIds) {
        const merged = this.docs.get(mergedId);
        if (merged === void 0) {
          throw new MemoryError("NOT_FOUND", `merged entry ${mergedId} does not exist`);
        }
        if (merged.status !== "accepted") {
          throw new MemoryError("INVALID_STATE", `merged entry ${mergedId} is ${merged.status}`);
        }
        if (merged.supersededBy !== null) {
          throw new MemoryError("INVALID_STATE", `merged entry ${mergedId} is already superseded by ${merged.supersededBy}`);
        }
        if (merged.type !== target.type) {
          throw new MemoryError("INVALID_INPUT", `merged entry ${mergedId} has type ${merged.type}, target has ${target.type}`);
        }
        if (formatScope(merged.scope) !== formatScope(target.scope)) {
          throw new MemoryError("SCOPE_FORBIDDEN", `merged entry ${mergedId} is not in scope ${formatScope(target.scope)}`);
        }
      }
    }
    const number = await this.allocate("PRO");
    const id = `PRO-${formatSequence(number)}`;
    const proposal = {
      id,
      status: "pending",
      operation: input.operation,
      type: input.type,
      scope,
      title,
      summary,
      tags,
      sourceRefs,
      related: input.related ?? [],
      supersedes: input.supersedes ?? [],
      appliesTo: {
        branches: input.appliesTo?.branches ?? [],
        versions: input.appliesTo?.versions ?? []
      },
      promotedFrom: input.promotedFrom ?? null,
      target: input.target ?? null,
      expectedVersion: input.expectedVersion ?? null,
      reason: input.reason ?? null,
      validFrom,
      expiresAt,
      lastVerified,
      mergedIds,
      taskId: options.taskId,
      createdAt: now,
      updatedAt: now,
      committedTo: null,
      body,
      path: this.hub.pendingPath(id),
      extra: {}
    };
    await writeAtomic(proposal.path, serializeProposalFile(proposal));
    this.proposals.set(id, proposal);
    return proposal;
  }
  async commit(proposalId, approvalRef = "dsh:approval") {
    await this.assertWritable();
    const proposal = this.proposals.get(proposalId);
    if (proposal === void 0) {
      throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    }
    if (proposal.status !== "pending") {
      throw new MemoryError("INVALID_STATE", `proposal ${proposalId} is ${proposal.status}`);
    }
    if (proposal.operation !== "deprecate" && proposal.sourceRefs.length === 0) {
      const required = this.hub.config.policy.evidence.required_for;
      if (required.includes(proposal.type)) {
        throw new MemoryError("INVALID_INPUT", `proposal ${proposalId} needs at least one source_ref for type ${proposal.type}`);
      }
    }
    const now = nowIso();
    let record;
    const superseded = [];
    if (proposal.operation === "create") {
      record = await this.createFromProposal(proposal, now);
      for (const oldId of record.supersedes) {
        const old = this.docs.get(oldId);
        if (old === void 0 || old.status !== "accepted") continue;
        const next = {
          ...old,
          status: "superseded",
          version: old.version + 1,
          updatedAt: now,
          path: this.hub.knowledgePath(old.type, old.id)
        };
        await this.archiveVersion(old);
        await this.writeRecord(next);
        superseded.push(old.id);
      }
    } else if (proposal.operation === "update") {
      record = await this.updateFromProposal(proposal, now);
    } else if (proposal.operation === "merge") {
      const merged = await this.mergeFromProposal(proposal, now);
      record = merged.record;
      superseded.push(...merged.merged);
    } else {
      record = await this.deprecateFromProposal(proposal, now);
    }
    await this.ledger.append({
      type: "proposal.committed",
      proposalId: proposal.id,
      knowledgeId: record.id,
      version: record.version,
      approvalRef
    });
    await this.archiveProposal(proposal, "committed", `${record.id}@${record.version}`);
    await this.refreshIndexFingerprint();
    return { record, superseded };
  }
  /**
   * 数据指纹 = 条目数 + 知识目录最近 mtime。目录 mtime 在新建/删除/原子替换文件时
   * 都会变化，所以外部编辑（或 git checkout）能被下一次启动检测到并触发重建。
   */
  async knowledgeFingerprint(count) {
    let maxMtime = 0;
    for (const type of Object.keys(TYPE_PREFIX)) {
      const info = await stat3(this.hub.knowledgeDir(type)).catch(() => null);
      if (info !== null) maxMtime = Math.max(maxMtime, Math.floor(info.mtimeMs));
    }
    return `${count}:${maxMtime}`;
  }
  async refreshIndexFingerprint() {
    if (this.indexBackend !== "sqlite") return;
    const fingerprint = await this.knowledgeFingerprint(this.docs.size);
    this.index.setFingerprint(fingerprint);
  }
  /** 拒绝候选：归档为 rejected 并记一条 proposal.rejected 账本事件。 */
  async reject(proposalId, reason) {
    await this.assertWritable();
    const proposal = this.proposals.get(proposalId);
    if (proposal === void 0) {
      throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    }
    if (proposal.status !== "pending") {
      throw new MemoryError("INVALID_STATE", `proposal ${proposalId} is ${proposal.status}`);
    }
    await this.ledger.append({
      type: "proposal.rejected",
      proposalId: proposal.id,
      ...reason === void 0 || reason === "" ? {} : { reason }
    });
    await this.archiveProposal(proposal, "rejected", null);
    return { proposalId, status: "rejected" };
  }
  async createFromProposal(proposal, now) {
    const prefix = TYPE_PREFIX[proposal.type];
    const number = await this.allocate(prefix);
    const id = `${prefix}-${formatSequence(number)}`;
    const supersedes = proposal.supersedes;
    for (const oldId of supersedes) {
      const old = this.docs.get(oldId);
      if (old === void 0 || old.status !== "accepted") {
        throw new MemoryError("INVALID_STATE", `supersedes target ${oldId} is not an accepted knowledge entry`);
      }
      if (old.id === id) throw new MemoryError("INVALID_STATE", "an entry cannot supersede itself");
    }
    const record = {
      id,
      type: proposal.type,
      scope: proposal.scope,
      status: "accepted",
      version: 1,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs: proposal.sourceRefs,
      related: proposal.related,
      supersedes,
      promotedFrom: proposal.promotedFrom,
      appliesTo: proposal.appliesTo,
      createdAt: now,
      updatedAt: now,
      validFrom: proposal.validFrom,
      expiresAt: proposal.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      supersededBy: null,
      format: 1,
      body: proposal.body,
      path: this.hub.knowledgePath(proposal.type, id),
      extra: {}
    };
    await this.writeRecord(record);
    return record;
  }
  async updateFromProposal(proposal, now) {
    const target = this.requireTarget(proposal);
    const record = {
      ...target,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs: proposal.sourceRefs,
      related: proposal.related,
      appliesTo: proposal.appliesTo,
      version: target.version + 1,
      updatedAt: now,
      // 文件模型里「未提供」与「清空」不可区分：更新提案缺省保留 target 的时间字段。
      validFrom: proposal.validFrom ?? target.validFrom,
      expiresAt: proposal.expiresAt ?? target.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      body: proposal.body,
      path: this.hub.knowledgePath(target.type, target.id)
    };
    await this.archiveVersion(target);
    await this.writeRecord(record);
    return record;
  }
  /**
   * merge 提交：target 接受合并稿并 +1；被合并项进入 superseded 并写反向指针。
   * 纯确定性——不重新计算相似度、不改写被合并项的正文。
   */
  async mergeFromProposal(proposal, now) {
    const target = this.requireTarget(proposal);
    const mergedIds = proposal.mergedIds;
    if (mergedIds.length === 0) {
      throw new MemoryError("INVALID_INPUT", "merge requires merged_ids");
    }
    const mergedRecords = [];
    for (const mergedId of mergedIds) {
      const merged = this.docs.get(mergedId);
      if (merged === void 0) throw new MemoryError("NOT_FOUND", `merged entry ${mergedId} does not exist`);
      if (merged.status !== "accepted") {
        throw new MemoryError("INVALID_STATE", `merged entry ${mergedId} is ${merged.status}`);
      }
      if (merged.supersededBy !== null) {
        throw new MemoryError("INVALID_STATE", `merged entry ${mergedId} is already superseded by ${merged.supersededBy}`);
      }
      if (merged.type !== target.type) {
        throw new MemoryError("INVALID_INPUT", `merged entry ${mergedId} has type ${merged.type}, target has ${target.type}`);
      }
      if (formatScope(merged.scope) !== formatScope(target.scope)) {
        throw new MemoryError("SCOPE_FORBIDDEN", `merged entry ${mergedId} is not in scope ${formatScope(target.scope)}`);
      }
      mergedRecords.push(merged);
    }
    const maxSourceRefs = this.hub.config.policy.limits.max_source_refs;
    const related = [.../* @__PURE__ */ new Set([...target.related, ...mergedIds, ...proposal.related])];
    const sourceRefs = [.../* @__PURE__ */ new Set([
      ...target.sourceRefs,
      ...proposal.sourceRefs,
      ...mergedRecords.flatMap((merged) => merged.sourceRefs)
    ])].slice(0, maxSourceRefs);
    const record = {
      ...target,
      title: proposal.title,
      summary: proposal.summary,
      tags: proposal.tags,
      sourceRefs,
      related,
      appliesTo: proposal.appliesTo,
      version: target.version + 1,
      updatedAt: now,
      validFrom: proposal.validFrom ?? target.validFrom,
      expiresAt: proposal.expiresAt ?? target.expiresAt,
      lastVerified: proposal.lastVerified ?? now,
      supersededBy: null,
      body: proposal.body,
      path: this.hub.knowledgePath(target.type, target.id)
    };
    await this.archiveVersion(target);
    await this.writeRecord(record);
    for (const merged of mergedRecords) {
      const next = {
        ...merged,
        status: "superseded",
        supersededBy: target.id,
        version: merged.version + 1,
        updatedAt: now,
        path: this.hub.knowledgePath(merged.type, merged.id)
      };
      await this.archiveVersion(merged);
      await this.writeRecord(next);
    }
    await this.ledger.append({
      type: "knowledge.merged",
      target: target.id,
      merged: mergedIds,
      version: record.version,
      proposalId: proposal.id
    });
    return { record, merged: mergedIds };
  }
  async deprecateFromProposal(proposal, now) {
    const target = this.requireTarget(proposal);
    const record = {
      ...target,
      status: "deprecated",
      version: target.version + 1,
      updatedAt: now,
      ...proposal.reason === null ? {} : { deprecatedReason: proposal.reason },
      path: this.hub.knowledgePath(target.type, target.id)
    };
    await this.archiveVersion(target);
    await this.writeRecord(record);
    return record;
  }
  requireTarget(proposal) {
    if (proposal.target === null) {
      throw new MemoryError("INVALID_INPUT", `${proposal.operation} requires target`);
    }
    if (proposal.expectedVersion === null) {
      throw new MemoryError("INVALID_INPUT", `${proposal.operation} requires expected_version`);
    }
    const target = this.docs.get(proposal.target);
    if (target === void 0) {
      throw new MemoryError("NOT_FOUND", `target ${proposal.target} does not exist`);
    }
    if (target.status !== "accepted") {
      throw new MemoryError("INVALID_STATE", `target ${proposal.target} is ${target.status}`);
    }
    if (target.version !== proposal.expectedVersion) {
      throw new MemoryError("VERSION_CONFLICT", `target ${proposal.target} is at version ${target.version}, expected ${proposal.expectedVersion}`);
    }
    if (formatScope(target.scope) !== formatScope(proposal.scope)) {
      throw new MemoryError("SCOPE_FORBIDDEN", "target scope does not match proposal scope");
    }
    return target;
  }
  async writeRecord(record) {
    await writeAtomic(record.path, serializeKnowledgeFile(record));
    this.docs.set(record.id, record);
    this.index.add(record);
  }
  async archiveVersion(record) {
    const path = this.hub.historyPath(record.type, record.id, record.version);
    if (await pathExists(path)) return;
    await writeAtomic(path, serializeKnowledgeFile(record));
  }
  async archiveProposal(proposal, status, committedTo) {
    const archived = {
      ...proposal,
      status,
      committedTo,
      updatedAt: nowIso(),
      path: this.hub.pendingArchivePath(proposal.id)
    };
    await writeAtomic(archived.path, serializeProposalFile(archived));
    await removeFile(proposal.path);
    this.proposals.set(proposal.id, archived);
  }
  async consolidate(options) {
    await this.assertWritable();
    const created = [];
    let skipped = 0;
    const targetScope = parseScope(options.targetScope);
    const existing = /* @__PURE__ */ new Set();
    for (const record of this.docs.values()) {
      if (record.promotedFrom !== null) existing.add(record.promotedFrom);
    }
    for (const proposal of this.proposals.values()) {
      if (proposal.promotedFrom !== null) existing.add(proposal.promotedFrom);
    }
    for (const workspaceId of options.workspaceIds) {
      for (const record of this.docs.values()) {
        if (record.scope.level !== "project" || record.scope.workspaceId !== workspaceId) continue;
        if (record.status !== "accepted") continue;
        if (options.types !== void 0 && !options.types.includes(record.type)) continue;
        const key = `project:${workspaceId}/${record.id}@${record.version}`;
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }
        if (options.dryRun === true) {
          created.push({
            ...await this.previewConsolidationProposal(record, key, targetScope)
          });
          existing.add(key);
          continue;
        }
        const proposal = await this.propose(
          {
            operation: "create",
            type: record.type,
            scope: options.targetScope,
            title: truncate2(`[promoted] ${record.title}`, 200),
            summary: truncate2(`[promoted] ${record.summary}`, 240),
            content: record.body,
            tags: record.tags,
            related: record.related,
            sourceRefs: [`note:${key}`],
            promotedFrom: key
          },
          { taskId: "TSK-consolidation" }
        );
        created.push(proposal);
        existing.add(key);
      }
    }
    return { created, skipped };
  }
  async previewConsolidationProposal(record, key, targetScope) {
    const now = nowIso();
    return {
      id: "PRO-preview",
      status: "pending",
      operation: "create",
      type: record.type,
      scope: targetScope,
      title: truncate2(`[promoted] ${record.title}`, 200),
      summary: truncate2(`[promoted] ${record.summary}`, 240),
      tags: record.tags,
      sourceRefs: [`note:${key}`],
      related: record.related,
      supersedes: [],
      appliesTo: { ...EMPTY_APPLIES },
      promotedFrom: key,
      target: null,
      expectedVersion: null,
      reason: null,
      validFrom: null,
      expiresAt: null,
      lastVerified: null,
      mergedIds: [],
      taskId: "TSK-consolidation",
      createdAt: now,
      updatedAt: now,
      committedTo: null,
      body: record.body,
      path: "",
      extra: {}
    };
  }
  async refreshPath(path) {
    const info = await stat3(path).catch(() => null);
    if (info === null) {
      const touchedKnowledge = isUnder(join5(this.hub.root, "knowledge"), path);
      this.removePath(path);
      if (touchedKnowledge) await this.refreshIndexFingerprint();
      return;
    }
    if (!info.isFile()) return;
    if (isUnder(this.hub.pendingDir(), path) && !isUnder(this.hub.pendingArchiveDir(), path)) {
      try {
        const proposal = parseProposalFile(await readFile5(path, "utf8"), path);
        this.proposals.set(proposal.id, proposal);
        this.pendingBacklog.delete(proposal.id);
      } catch (error) {
        this.diagnostics.push({ path, message: error.message });
      }
      return;
    }
    if (!isUnder(join5(this.hub.root, "knowledge"), path)) return;
    try {
      const record = parseKnowledgeFile(await readFile5(path, "utf8"), path);
      this.docs.set(record.id, record);
      this.index.add(record);
      this.bumpSequence(TYPE_PREFIX[record.type], sequenceOf(record.id));
    } catch (error) {
      this.diagnostics.push({ path, message: error.message });
    }
    await this.refreshIndexFingerprint();
  }
  removePath(path) {
    const name = basename3(path);
    const id = name.endsWith(".md") ? name.slice(0, -3) : name;
    if (this.docs.has(id)) {
      this.docs.delete(id);
      this.index.remove(id);
      return;
    }
    if (this.proposals.has(id)) {
      this.proposals.delete(id);
      return;
    }
    this.pendingBacklog.delete(id);
  }
  bumpSequence(prefix, value) {
    this.sequences[prefix] = Math.max(this.sequences[prefix] ?? 0, value);
  }
  async allocate(key) {
    const next = (this.sequences[key] ?? 0) + 1;
    this.sequences[key] = next;
    await ensureDir(join5(this.hub.root, "records"));
    await writeAtomic(this.hub.sequencesPath(), `${JSON.stringify(this.sequences, null, 2)}
`);
    return next;
  }
  /**
   * Write gate for every mutation.
   *
   * It is async because the writer lock is a lease: a hub that started read-only
   * (another DSH process was running, or this process crashed and was restarted
   * while the old lock was still fresh) re-tries the acquisition here, and a hub
   * whose lease was stolen re-verifies ownership before touching any file. That
   * makes lock recovery lazy and automatic instead of requiring a restart or a
   * manual `rm .writer.lock`.
   */
  async assertWritable() {
    if (await this.hub.ensureWritable()) return;
    throw new MemoryError("READ_ONLY", this.hub.readOnlyReason ?? "memory hub is read-only");
  }
  static relativePath(root, path) {
    return relative(root, path).replace(/\\/g, "/");
  }
  static isVisible(record, visibility) {
    return isScopeVisible(record.scope, visibility);
  }
};
async function readdirSafe(path) {
  try {
    return await readdir(path);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function truncate2(value, max) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

// src/service.ts
import { createHash as createHash3 } from "node:crypto";
import { appendFile as appendFile2, mkdir as mkdir3, readFile as readFile7, realpath } from "node:fs/promises";
import { isAbsolute, join as join9, relative as relative2, sep as sep2 } from "node:path";
var import_yaml4 = __toESM(require_dist(), 1);

// src/maintenance.ts
import { createHash } from "node:crypto";

// src/duplicates.ts
var DEFAULT_DUPLICATE_THRESHOLD = 0.72;
var DEFAULT_DUPLICATE_MAX_PAIRS = 20;
var HIGH_CONFIDENCE_TITLE_THRESHOLD = 0.82;
var BODY_SAMPLE_BYTES = 4096;
function findNearDuplicates(options) {
  const threshold = options.threshold ?? DEFAULT_DUPLICATE_THRESHOLD;
  const maxPairs = options.maxPairs ?? DEFAULT_DUPLICATE_MAX_PAIRS;
  const buckets = /* @__PURE__ */ new Map();
  for (const record of options.records) {
    if (record.status !== "accepted") continue;
    if (record.supersededBy !== null) continue;
    const key = `${record.type}\0${formatScope(record.scope)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(record);
    buckets.set(key, bucket);
  }
  const pairs = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const profiles = bucket.map(profileOf);
    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        const pair = compare(profiles[left], profiles[right]);
        if (pair.similarity < threshold) continue;
        const keeper = keeperOf(profiles[left].record, profiles[right].record);
        const other = keeper.id === profiles[left].record.id ? profiles[right].record : profiles[left].record;
        pairs.push({
          keeperId: keeper.id,
          otherId: other.id,
          similarity: round(pair.similarity),
          titleSimilarity: round(pair.titleSimilarity),
          highConfidence: pair.titleSimilarity >= HIGH_CONFIDENCE_TITLE_THRESHOLD
        });
      }
    }
  }
  pairs.sort(
    (left, right) => right.similarity - left.similarity || left.keeperId.localeCompare(right.keeperId) || left.otherId.localeCompare(right.otherId)
  );
  return pairs.slice(0, Math.max(1, maxPairs));
}
function profileOf(record) {
  const lexicalText = `${record.title} ${record.summary}`;
  return {
    record,
    lexical: lexicalText,
    lexicalTokens: new Set(tokenize(lexicalText)),
    bodyTokens: shingles(record.body.slice(0, BODY_SAMPLE_BYTES))
  };
}
function compare(left, right) {
  const lexical = jaccard(left.lexicalTokens, right.lexicalTokens);
  const body = jaccard(left.bodyTokens, right.bodyTokens);
  return {
    similarity: 0.6 * lexical + 0.4 * body,
    titleSimilarity: bigramJaccard(left.record.title, right.record.title)
  };
}
function keeperOf(left, right) {
  if (left.version !== right.version) return left.version > right.version ? left : right;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  if (left.sourceRefs.length !== right.sourceRefs.length) {
    return left.sourceRefs.length > right.sourceRefs.length ? left : right;
  }
  return left.id <= right.id ? left : right;
}
function shingles(text) {
  const chars = Array.from(text.replace(/\s+/g, " "));
  const grams = /* @__PURE__ */ new Set();
  if (chars.length <= 3) {
    if (chars.length > 0) grams.add(chars.join(""));
    return grams;
  }
  for (let index = 0; index <= chars.length - 3; index += 1) {
    grams.add(`${chars[index]}${chars[index + 1]}${chars[index + 2]}`);
  }
  return grams;
}
function bigramJaccard(left, right) {
  return jaccard(bigrams(left), bigrams(right));
}
function bigrams(value) {
  const chars = Array.from(value.trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""));
  const grams = /* @__PURE__ */ new Set();
  if (chars.length < 2) {
    if (chars.length === 1) grams.add(chars[0]);
    return grams;
  }
  for (let index = 0; index < chars.length - 1; index += 1) grams.add(`${chars[index]}${chars[index + 1]}`);
  return grams;
}
function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
function round(value) {
  return Math.round(value * 1e3) / 1e3;
}

// src/maintenance.ts
var PROMOTE_TAGS = /* @__PURE__ */ new Set(["core", "shared", "reusable", "promote"]);
function maintenanceToken(fingerprint) {
  return `maint-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 12)}`;
}
function analyzeMaintenance(store, options) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const nowMs = now.getTime();
  const accepted = [...store.docs.values()].filter((record) => record.status === "accepted");
  const pending = [...store.proposals.values()].filter((proposal) => proposal.status === "pending");
  const workspaceIds = new Set(options.workspaces.map((workspace) => workspace.id));
  const issues = [];
  const candidates = [];
  const temporal = options.temporal ?? DEFAULT_TEMPORAL_POLICY;
  const temporalCounts = { fresh: 0, aging: 0, stale: 0, scheduled: 0 };
  for (const record of accepted) {
    const state = temporalState(record, nowMs, temporal);
    const lastCitedAt = options.citations.get(record.id) ?? null;
    const basis = laterIso(record.lastVerified ?? record.updatedAt, lastCitedAt);
    const basisAge = ageDays(basis, nowMs);
    const recentlyCited = basisAge !== null && basisAge < temporal.aging_days;
    if (state === "aging" && recentlyCited) {
      temporalCounts.fresh += 1;
      continue;
    }
    temporalCounts[state] += 1;
    if (state === "stale") {
      issues.push({
        code: "expired",
        severity: "warn",
        message: `${record.id} \u5DF2\u4E8E ${record.expiresAt ?? "\u672A\u77E5\u65F6\u95F4"} \u5230\u671F\uFF0C\u9700\u8981\u590D\u6838\u540E\u66F4\u65B0 expires_at\uFF1A${record.title}`,
        ids: [record.id]
      });
    } else if (state === "aging") {
      const citationNote = lastCitedAt === null ? "" : `\uFF08\u6700\u8FD1\u5F15\u7528 ${formatDay(lastCitedAt)}\uFF09`;
      issues.push({
        code: "aging",
        severity: "info",
        message: `${record.id} \u5DF2 ${basisAge ?? 0} \u5929\u672A\u786E\u8BA4${citationNote}\uFF1A${record.title}`,
        ids: [record.id]
      });
    }
  }
  const duplicateGroups = /* @__PURE__ */ new Map();
  for (const record of accepted) {
    const key = [
      record.type,
      normalizeText2(record.title),
      normalizeText2(record.summary),
      sha256(record.body.trim())
    ].join("|");
    const group = duplicateGroups.get(key) ?? [];
    group.push(record);
    duplicateGroups.set(key, group);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort(
      (left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
    );
    const keeper = ordered[0];
    for (const duplicate of ordered.slice(1)) {
      const fingerprint = `duplicate:${duplicate.id}@${duplicate.version}:${keeper.id}`;
      const token = maintenanceToken(fingerprint);
      const issue = {
        code: "duplicate-exact",
        severity: "warn",
        message: `${duplicate.id} \u4E0E ${keeper.id} \u7684\u6807\u9898\u3001\u6458\u8981\u548C\u6B63\u6587\u5B8C\u5168\u76F8\u540C\u3002`,
        ids: [duplicate.id, keeper.id]
      };
      issues.push(issue);
      candidates.push({
        kind: "duplicate",
        fingerprint,
        issue,
        input: {
          operation: "deprecate",
          type: duplicate.type,
          scope: formatScope(duplicate.scope),
          title: truncate3(`[\u7EF4\u62A4] \u5E9F\u5F03\u91CD\u590D\uFF1A${duplicate.id}`, 200),
          summary: truncate3(`${duplicate.id} \u4E0E ${keeper.id} \u5B8C\u5168\u76F8\u540C\uFF0C\u5EFA\u8BAE\u5E9F\u5F03\u91CD\u590D\u9879\u3002`, 240),
          target: duplicate.id,
          expectedVersion: duplicate.version,
          reason: `exact duplicate of ${keeper.id}`,
          sourceRefs: [`note:maintenance duplicate ${duplicate.id}@v${duplicate.version} == ${keeper.id}@v${keeper.version}`],
          tags: mergeTags(duplicate.tags, ["maintenance", token, "duplicate"]),
          related: [keeper.id]
        }
      });
    }
  }
  const nearPairs = findNearDuplicates({
    records: accepted,
    threshold: options.dedupe?.threshold ?? DEFAULT_DUPLICATE_THRESHOLD,
    maxPairs: options.dedupe?.maxPairs ?? DEFAULT_DUPLICATE_MAX_PAIRS
  });
  for (const pair of nearPairs) {
    const keeper = store.docs.get(pair.keeperId);
    const other = store.docs.get(pair.otherId);
    issues.push({
      code: "duplicate-near",
      severity: "info",
      message: `${pair.otherId}\uFF08${other?.title ?? "?"}\uFF09\u4E0E ${pair.keeperId}\uFF08${keeper?.title ?? "?"}\uFF09\u76F8\u4F3C\u5EA6 ${pair.similarity}${pair.highConfidence ? "\uFF08\u6807\u9898\u9AD8\u5EA6\u76F8\u4F3C\uFF09" : ""}\uFF0C\u5EFA\u8BAE\u4FDD\u7559 ${pair.keeperId} \u5E76\u7528 memory_propose operation:"merge" \u5408\u5E76\u3002`,
      ids: [pair.otherId, pair.keeperId]
    });
  }
  for (const proposal of pending) {
    const age = ageDays(proposal.createdAt, nowMs);
    if (age !== null && age >= options.stalePendingDays) {
      issues.push({
        code: "stale-pending",
        severity: "info",
        message: `${proposal.id} \u5DF2 pending ${age} \u5929\uFF1A${proposal.title}`,
        ids: [proposal.id]
      });
    }
  }
  let uncited = 0;
  const cited = accepted.filter((record) => options.citations.has(record.id)).length;
  for (const record of accepted) {
    const lastCitedAt = options.citations.get(record.id) ?? null;
    const age = ageDays(lastCitedAt ?? record.updatedAt, nowMs);
    if (age === null || age < options.staleCitationDays) continue;
    uncited += 1;
    if (uncited > 20) continue;
    issues.push({
      code: "uncited",
      severity: "info",
      message: lastCitedAt === null ? `${record.id} \u521B\u5EFA\u4EE5\u6765 ${age} \u5929\u4ECE\u672A\u88AB\u5F15\u7528\uFF1A${record.title}` : `${record.id} \u5DF2 ${age} \u5929\u672A\u88AB\u5F15\u7528\uFF08\u6700\u8FD1\u5F15\u7528 ${formatDay(lastCitedAt)}\uFF09\uFF1A${record.title}`,
      ids: [record.id]
    });
  }
  const agenda = options.agenda;
  if (agenda !== void 0 && agenda.size > 0) {
    const threshold = 3;
    const agendaRecords = [];
    for (const [knowledgeId, count] of agenda) {
      const record = store.docs.get(knowledgeId);
      if (record === void 0 || record.status !== "accepted") continue;
      agendaRecords.push(record);
      if (count >= threshold) {
        issues.push({
          code: "distill-hint",
          severity: "info",
          message: `${record.id} \u5728\u8BAE\u7A0B\u4E2D\u51FA\u73B0 ${count} \u6B21\uFF0C\u4F7F\u7528\u4FE1\u53F7\u5DF2\u8DB3\u591F\uFF0C\u5EFA\u8BAE\u84B8\u998F\u63D0\u70BC\uFF1A${record.title}`,
          ids: [record.id]
        });
      }
    }
    const topicGroups = /* @__PURE__ */ new Map();
    for (const record of agendaRecords) {
      for (const tag of record.tags) {
        if (tag === "" || tag.startsWith("maint-") || tag.startsWith("mh:")) continue;
        const ids = topicGroups.get(tag) ?? [];
        if (!ids.includes(record.id)) ids.push(record.id);
        topicGroups.set(tag, ids);
      }
    }
    let topicHints = 0;
    for (const [tag, ids] of [...topicGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (ids.length < threshold) continue;
      if (topicHints >= 10) break;
      topicHints += 1;
      issues.push({
        code: "distill-hint",
        severity: "info",
        message: `\u4E3B\u9898\u300C${tag}\u300D\u4E0B\u6709 ${ids.length} \u6761\u6761\u76EE\u6B63\u5728\u88AB\u4F7F\u7528\uFF08${ids.join("\u3001")}\uFF09\uFF0C\u5EFA\u8BAE\u84B8\u998F\u6210\u4E00\u6761\u63D0\u70BC\u6761\u76EE`,
        ids
      });
    }
  }
  for (const diagnostic of store.diagnostics) {
    issues.push({
      code: "load-diagnostic",
      severity: "warn",
      message: `${diagnostic.path}: ${diagnostic.message}`,
      ids: []
    });
  }
  for (const record of accepted) {
    if (Buffer.byteLength(record.body, "utf8") > options.maxBodyBytes) {
      issues.push({
        code: "oversized-body",
        severity: "info",
        message: `${record.id} \u6B63\u6587\u8D85\u8FC7 ${options.maxBodyBytes} bytes\uFF0C\u5EFA\u8BAE\u62C6\u5206\u3002`,
        ids: [record.id]
      });
    }
    if (record.scope.level === "project" && !workspaceIds.has(record.scope.workspaceId)) {
      issues.push({
        code: "scope-mismatch",
        severity: "warn",
        message: `${record.id} \u4F7F\u7528\u672A\u6CE8\u518C\u4F5C\u7528\u57DF project:${record.scope.workspaceId}\u3002`,
        ids: [record.id]
      });
    }
  }
  const coreId = options.coreId;
  if (coreId !== null) {
    const alreadyPromoted = /* @__PURE__ */ new Set();
    for (const record of store.docs.values()) {
      if (record.promotedFrom !== null) alreadyPromoted.add(record.promotedFrom);
    }
    for (const proposal of store.proposals.values()) {
      if (proposal.promotedFrom !== null) alreadyPromoted.add(proposal.promotedFrom);
    }
    const coreTitles = new Set(
      accepted.filter((record) => record.scope.level === "project" && record.scope.workspaceId === coreId).map((record) => `${normalizeText2(record.title)}\0${normalizeText2(record.summary)}`)
    );
    for (const record of accepted) {
      if (record.scope.level !== "project" || record.scope.workspaceId === coreId) continue;
      if (!record.tags.some((tag) => PROMOTE_TAGS.has(tag))) continue;
      const key = `project:${record.scope.workspaceId}/${record.id}@${record.version}`;
      if (alreadyPromoted.has(key)) continue;
      if (coreTitles.has(`${normalizeText2(record.title)}\0${normalizeText2(record.summary)}`)) continue;
      const fingerprint = `promotion:${key}`;
      const token = maintenanceToken(fingerprint);
      const issue = {
        code: "promotion-candidate",
        severity: "info",
        message: `${record.id} \u5E26\u6709\u590D\u7528\u6807\u8BB0\uFF0C\u53EF\u664B\u5347\u5230\u6838\u5FC3\u4F5C\u7528\u57DF\u3002`,
        ids: [record.id]
      };
      candidates.push({
        kind: "promotion",
        fingerprint,
        issue,
        input: {
          operation: "create",
          type: record.type,
          scope: `project:${coreId}`,
          title: truncate3(`[promoted] ${record.title}`, 200),
          summary: truncate3(`[promoted] ${record.summary}`, 240),
          content: record.body,
          sourceRefs: [`note:${key}`, ...record.sourceRefs].slice(0, 20),
          tags: mergeTags(record.tags, ["maintenance", token, "promoted"]),
          related: record.related,
          promotedFrom: key
        }
      });
    }
  }
  const workspaceStats = options.workspaces.map((workspace) => ({
    id: workspace.id,
    accepted: accepted.filter(
      (record) => record.scope.level === "project" && record.scope.workspaceId === workspace.id
    ).length,
    pending: pending.filter(
      (proposal) => proposal.scope.level === "project" && proposal.scope.workspaceId === workspace.id
    ).length
  }));
  candidates.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "duplicate" ? -1 : 1;
    return left.fingerprint.localeCompare(right.fingerprint);
  });
  return {
    issues,
    candidates,
    workspaceStats,
    totals: {
      knowledge: store.docs.size,
      pending: pending.length,
      accepted: accepted.length,
      proposalsExisting: store.proposals.size,
      ...temporalCounts,
      cited
    }
  };
}
function renderMaintenanceReport(input) {
  const lines = [
    "# Memory Hub Maintenance",
    "",
    `- Generated: ${input.generatedAt}`,
    `- Mode: ${input.apply}`,
    `- Hub: ${input.root}`,
    `- Core: ${input.coreId ?? "(fallback)"}`,
    `- Report: ${input.reportPath ?? "(not written)"}`,
    "",
    "## Summary",
    "",
    `- knowledge: ${input.analysis.totals.knowledge} (accepted ${input.analysis.totals.accepted})`,
    `- pending: ${input.analysis.totals.pending}`,
    `- issues: ${input.analysis.issues.length}`,
    `- candidates: ${input.analysis.candidates.length}`,
    `- temporal: fresh ${input.analysis.totals.fresh} \xB7 aging ${input.analysis.totals.aging} \xB7 stale ${input.analysis.totals.stale} \xB7 scheduled ${input.analysis.totals.scheduled}`,
    `- cited: ${input.analysis.totals.cited} / accepted ${input.analysis.totals.accepted}`,
    `- proposals created: ${input.created.length}`,
    `- skipped (already pending): ${input.skipped}`,
    `- max proposals: ${input.maxProposals}`,
    "",
    "## Workspaces",
    "",
    "| workspace | accepted | pending |",
    "| --- | ---: | ---: |",
    ...input.analysis.workspaceStats.map((stat4) => `| ${stat4.id} | ${stat4.accepted} | ${stat4.pending} |`),
    "",
    "## Created proposals",
    "",
    ...input.created.length === 0 ? ["- none"] : input.created.map(
      (proposal) => `- ${proposal.id} \xB7 ${proposal.operation} \xB7 ${formatScope(proposal.scope)} \xB7 ${proposal.title}`
    ),
    "",
    "## Issues",
    ""
  ];
  const byCode = /* @__PURE__ */ new Map();
  for (const issue of input.analysis.issues) {
    const list = byCode.get(issue.code) ?? [];
    list.push(issue);
    byCode.set(issue.code, list);
  }
  if (byCode.size === 0) {
    lines.push("- none", "");
  } else {
    for (const [code, list] of [...byCode.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(`### ${code} (${list.length})`, "");
      for (const issue of list.slice(0, 20)) lines.push(`- ${issue.message}`);
      if (list.length > 20) lines.push(`- (+${list.length - 20} more)`);
      lines.push("");
    }
  }
  lines.push(
    "## Guardrails",
    "",
    "- This report is not authoritative knowledge.",
    "- Proposals are pending; nothing was committed, deleted, or rewritten.",
    "- Exact duplicates become deprecate proposals; project knowledge is promoted only with an explicit reuse tag.",
    "- Expired entries are reported only: they are never deleted or rewritten automatically.",
    "- Uncited entries are reported only: a recent citation can refresh aging, but nothing is archived automatically.",
    "- Review pending proposals in the Web panel or with memory_get, then commit intentionally.",
    ""
  );
  return lines.join("\n");
}
function normalizeText2(value) {
  return value.trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function laterIso(left, right) {
  if (right === null) return left;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(rightMs)) return left;
  if (!Number.isFinite(leftMs)) return right;
  return rightMs > leftMs ? right : left;
}
function formatDay(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : value;
}
function ageDays(value, nowMs) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((nowMs - timestamp) / 864e5);
}
function mergeTags(existing, extra) {
  return [.../* @__PURE__ */ new Set([...extra, ...existing])].slice(0, 12);
}
function truncate3(value, max) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

// src/risk.ts
var INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu;
var INVISIBLE_NAMES = {
  "\u200B": "\u96F6\u5BBD\u7A7A\u683C",
  "\u200C": "\u96F6\u5BBD\u975E\u8FDE\u63A5\u7B26",
  "\u200D": "\u96F6\u5BBD\u8FDE\u63A5\u7B26",
  "\u200E": "\u4ECE\u5DE6\u5230\u53F3\u6807\u8BB0",
  "\u200F": "\u4ECE\u53F3\u5230\u5DE6\u6807\u8BB0",
  "\u202A": "\u5DE6\u5230\u53F3\u5D4C\u5165",
  "\u202B": "\u53F3\u5230\u5DE6\u5D4C\u5165",
  "\u202C": "\u65B9\u5411\u683C\u5F0F\u7ED3\u675F",
  "\u202D": "\u5DE6\u5230\u53F3\u8986\u76D6",
  "\u202E": "\u53F3\u5230\u5DE6\u8986\u76D6",
  "\u2060": "\u8BCD\u8FDE\u63A5\u7B26",
  "\u2061": "\u51FD\u6570\u5E94\u7528",
  "\u2062": "\u4E0D\u53EF\u89C1\u4E58\u53F7",
  "\u2063": "\u4E0D\u53EF\u89C1\u5206\u9694\u7B26",
  "\u2064": "\u4E0D\u53EF\u89C1\u52A0\u53F7",
  "\uFEFF": "BOM/\u96F6\u5BBD\u4E0D\u6362\u884C\u7A7A\u683C"
};
var INJECTION_PATTERNS = [
  { pattern: /忽略(?:以上|之前|前面|上述|此前)?.{0,6}(?:指令|提示|规则|要求)/u, label: "\u8981\u6C42\u5FFD\u7565\u65E2\u6709\u6307\u4EE4" },
  { pattern: /(?:无视|跳过).{0,6}(?:系统|安全|审批).{0,4}(?:指令|提示|规则)/u, label: "\u8981\u6C42\u7ED5\u8FC7\u7CFB\u7EDF/\u5BA1\u6279\u89C4\u5219" },
  { pattern: /(?:你现在是|从现在开始你(?:是|要)|你的新(?:身份|角色)是)/u, label: "\u8BD5\u56FE\u6539\u5199\u6A21\u578B\u8EAB\u4EFD" },
  { pattern: /(?:system\s*prompt|系统提示词?|开发者指令)/iu, label: "\u63D0\u53CA\u7CFB\u7EDF\u63D0\u793A\u8BCD" },
  { pattern: /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/i, label: "asks to ignore earlier instructions" },
  { pattern: /disregard\s+(?:the\s+)?(?:system|previous|prior|above)/i, label: "asks to disregard system/previous context" },
  { pattern: /you\s+are\s+now\s+(?:a|an|the|in)\b/i, label: "rewrites the model identity" },
  { pattern: /<\|(?:im_start|im_end|system|assistant)\|>/i, label: "\u804A\u5929\u6A21\u677F\u63A7\u5236\u7B26" }
];
var OVERRIDE_PATTERNS = [
  { pattern: /^\s*(?:system|assistant|developer)\s*[:：]/im, label: "\u884C\u9996\u4F2A\u9020 system/assistant \u89D2\u8272" },
  { pattern: /^\s*<\/?(?:instructions?|system|prompt)>/im, label: "\u4F2A\u9020\u6307\u4EE4\u95ED\u5408\u6807\u7B7E" },
  { pattern: /\[\/?(?:INST|SYS)\]|<<\/?SYS>>/i, label: "Llama \u98CE\u683C\u6307\u4EE4\u6807\u8BB0" }
];
var CREDENTIAL_PATTERNS = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/, label: "OpenAI \u98CE\u683C\u5BC6\u94A5\uFF08sk-\u2026\uFF09" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, label: "GitHub token" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key id" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "\u79C1\u94A5\u5757" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/, label: "JWT" },
  {
    pattern: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?token)\s*[:=]\s*\S{6,}/i,
    label: "\u5F62\u5982 password=/token= \u7684\u51ED\u636E\u8D4B\u503C"
  }
];
function clip(value, max = 60) {
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}\u2026`;
}
function firstMatch(patterns, text) {
  const signals = [];
  for (const { pattern, label } of patterns) {
    const match = pattern.exec(text);
    if (match !== null) signals.push({ code: "prompt-injection", label, sample: clip(match[0]) });
  }
  return signals;
}
function scanInvisible(text) {
  INVISIBLE.lastIndex = 0;
  const chars = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(INVISIBLE)) {
    const char = match[0];
    chars.add(INVISIBLE_NAMES[char] ?? "\u4E0D\u53EF\u89C1\u5B57\u7B26");
    if (chars.size >= 3) break;
  }
  if (chars.size === 0) return null;
  return {
    code: "invisible-characters",
    label: `\u5305\u542B\u4E0D\u53EF\u89C1/\u65B9\u5411\u63A7\u5236\u5B57\u7B26\uFF08${[...chars].join("\u3001")}\uFF09`,
    sample: `${chars.size} \u7C7B`
  };
}
function assessProposalRisk(input) {
  const text = [input.title ?? "", input.summary ?? "", input.content ?? "", ...input.sourceRefs ?? []].join("\n");
  if (text.trim() === "") return { level: "none", signals: [] };
  const signals = [];
  const invisible = scanInvisible(text);
  if (invisible !== null) signals.push(invisible);
  for (const signal of firstMatch(INJECTION_PATTERNS, text)) signals.push(signal);
  const credentialSignals = [];
  for (const { pattern, label } of CREDENTIAL_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) credentialSignals.push({ code: "credential-material", label, sample: clip(match[0], 24) });
  }
  signals.push(...credentialSignals);
  for (const { pattern, label } of OVERRIDE_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) signals.push({ code: "override-phrase", label, sample: clip(match[0]) });
  }
  const seen = /* @__PURE__ */ new Set();
  const unique = signals.filter((signal) => {
    const key = `${signal.code}:${signal.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { level: unique.length === 0 ? "none" : "review", signals: unique };
}

// src/reflect.ts
import { createHash as createHash2 } from "node:crypto";
import { readFile as readFile6, writeFile as writeFile2 } from "node:fs/promises";
function reflectRoots(config) {
  const roots = [];
  for (const core of config.core_workspaces) {
    const root = workspaceRoot(core);
    if (root !== null) roots.push({ workspaceId: core.id, kind: "core", root });
  }
  for (const workspace of config.workspaces) {
    if (workspace.enabled === false) continue;
    const root = workspaceRoot(workspace);
    if (root !== null) roots.push({ workspaceId: workspace.id, kind: "workspace", root });
  }
  return roots;
}
function workspaceRoot(entry) {
  const trimmed = entry.root?.trim();
  if (trimmed === void 0 || trimmed === "") return null;
  return expandHome(trimmed);
}
function normalizePath(value) {
  const unified = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? unified.toLowerCase() : unified;
}
function ownerWorkspaceOf(cwd, roots) {
  if (cwd === void 0 || cwd.trim() === "") return null;
  const normalized = normalizePath(cwd.trim());
  let best = null;
  let bestLength = -1;
  for (const root of roots) {
    const candidate = normalizePath(root.root);
    if (candidate === "") continue;
    if (normalized !== candidate && !normalized.startsWith(`${candidate}/`)) continue;
    if (candidate.length > bestLength) {
      best = root;
      bestLength = candidate.length;
    }
  }
  return best;
}
var MAX_ENTRY_CHARS = 1500;
function buildDigest(snapshot, options) {
  const entries = [];
  const failures = [];
  const callNames = /* @__PURE__ */ new Map();
  let pendingAssistant = null;
  let messageCount = 0;
  const flushAssistant = () => {
    if (pendingAssistant === null) return;
    const text2 = pendingAssistant.trim();
    pendingAssistant = null;
    if (text2 === "") return;
    entries.push({ role: "assistant", text: truncate4(text2, MAX_ENTRY_CHARS) });
    messageCount += 1;
  };
  for (const event of snapshot.events) {
    if (event === null || typeof event !== "object") continue;
    const data = event.data;
    if (data === void 0 || data === null) continue;
    if (event.type === "user/message") {
      const text2 = messageText(data).trim();
      if (text2 === "") continue;
      flushAssistant();
      entries.push({ role: "user", text: truncate4(text2, MAX_ENTRY_CHARS) });
      messageCount += 1;
      continue;
    }
    if (event.type === "assistant/message") {
      const message = data.message;
      const text2 = message === void 0 ? "" : messageText(message).trim();
      if (text2 !== "") pendingAssistant = text2;
      continue;
    }
    if (event.type === "turn/end") {
      flushAssistant();
      continue;
    }
    if (event.type === "tool/call") {
      const callId = typeof data.callId === "string" ? data.callId : null;
      const name = typeof data.name === "string" ? data.name : "tool";
      if (callId !== null) callNames.set(callId, name);
      continue;
    }
    if (event.type === "tool/result") {
      const error = data.error;
      if (error === void 0 || error === null) continue;
      const message = data.message;
      const callId = typeof message?.toolCallId === "string" ? message.toolCallId : null;
      const name = callId === null ? "tool" : callNames.get(callId) ?? "tool";
      const code = typeof error.code === "string" ? error.code : "error";
      const reason = typeof error.reason === "string" ? error.reason : "";
      const label = typeof error.name === "string" ? error.name : code;
      failures.push({ name, error: truncate4(reason === "" ? label : `${label}: ${reason}`, 200) });
    }
  }
  flushAssistant();
  if (entries.length === 0 && failures.length === 0) return { status: "empty" };
  if (messageCount < options.minMessages) return { status: "too-short", messages: messageCount };
  const cwd = typeof snapshot.session?.cwd === "string" ? snapshot.session.cwd : "";
  const createdAt = typeof snapshot.session?.createdAt === "number" ? new Date(snapshot.session.createdAt).toISOString() : nowIso();
  const rendered = renderEntries(entries, failures);
  const { text, truncated } = clip2(rendered, options.maxChars);
  return {
    status: "ok",
    digest: {
      sessionId: snapshot.session?.id ?? "",
      workspaceId: options.workspaceId,
      cwd,
      createdAt,
      entries,
      failures,
      chars: text.length,
      truncated
    }
  };
}
function renderEntries(entries, failures) {
  const lines = [];
  for (const entry of entries) {
    lines.push(entry.role === "user" ? `\u7528\u6237\uFF1A${entry.text}` : `\u52A9\u624B\uFF1A${entry.text}`);
  }
  for (const failure of failures) {
    lines.push(`\u5931\u8D25\u5DE5\u5177\uFF1A${failure.name} \u2014 ${failure.error}`);
  }
  return lines.join("\n\n");
}
function clip2(value, maxChars) {
  if (value.length <= maxChars) return { text: value, truncated: false };
  const marker = "\n\n\u2026\uFF08\u5DF2\u622A\u65AD\uFF09";
  const budget = Math.max(0, maxChars - marker.length);
  const head = Math.floor(budget * 0.6);
  const tail = budget - head;
  return { text: `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`, truncated: true };
}
function messageText(message) {
  const blocks = message.blocks;
  if (Array.isArray(blocks)) {
    return blocks.map((block) => block !== null && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : "").filter((text) => text !== "").join("\n");
  }
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (block === null || typeof block !== "object") return "";
      const typed = block;
      return typed.type === "text" ? String(typed.text ?? "") : "";
    }).filter((text) => text !== "").join("\n");
  }
  return "";
}
function truncate4(value, max) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}
function digestHash(digest) {
  const stable = JSON.stringify({
    sessionId: digest.sessionId,
    entries: digest.entries,
    failures: digest.failures
  });
  return createHash2("sha256").update(stable).digest("hex");
}
function renderDigest(digest) {
  const lines = [
    `## \u4F1A\u8BDD ${digest.sessionId}`,
    `- \u5DE5\u4F5C\u533A\uFF1A${digest.workspaceId}`,
    `- cwd\uFF1A${digest.cwd === "" ? "\uFF08\u672A\u77E5\uFF09" : digest.cwd}`,
    `- \u5F00\u59CB\u4E8E\uFF1A${digest.createdAt}`,
    `- \u5B57\u7B26\u6570\uFF1A${digest.chars}${digest.truncated ? "\uFF08\u5DF2\u622A\u65AD\uFF09" : ""}`,
    "",
    "### \u7528\u6237\u8BC9\u6C42\u4E0E\u52A9\u624B\u7ED3\u8BBA",
    ""
  ];
  for (const entry of digest.entries) {
    lines.push(entry.role === "user" ? `**\u7528\u6237**\uFF1A${entry.text}` : `**\u52A9\u624B**\uFF1A${entry.text}`);
    lines.push("");
  }
  if (digest.failures.length > 0) {
    lines.push("### \u5931\u8D25\u7684\u5DE5\u5177\u8C03\u7528");
    lines.push("");
    for (const failure of digest.failures) lines.push(`- \`${failure.name}\`\uFF1A${failure.error}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
var ReflectStateFile = class {
  constructor(file, limit = 200) {
    this.file = file;
    this.limit = limit;
  }
  state = { v: 1, sessions: [] };
  loaded = false;
  async load() {
    try {
      const raw = await readFile6(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object" && Array.isArray(parsed.sessions)) {
        this.state = {
          v: 1,
          sessions: parsed.sessions.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.sessionId === "string" && typeof entry.digestHash === "string")
        };
      }
    } catch {
      this.state = { v: 1, sessions: [] };
    }
    this.loaded = true;
  }
  entries() {
    return this.state.sessions;
  }
  find(sessionId) {
    return this.state.sessions.find((entry) => entry.sessionId === sessionId);
  }
  async mark(entry) {
    if (!this.loaded) await this.load();
    this.state.sessions = [entry, ...this.state.sessions.filter((item) => item.sessionId !== entry.sessionId)].slice(0, this.limit);
    await writeFile2(this.file, `${JSON.stringify(this.state, null, 2)}
`, "utf8");
  }
};

// src/tencent-sync.ts
var EMPTY_STATE = { lastPullAt: null, lastPushAt: null, outboxPending: 0, lastError: null, pushedIds: [], pulledIds: [] };
function statePath(recordsDir) {
  return `${recordsDir.replace(/\/+$/, "")}/tencent-state.json`;
}
function outboxPath(recordsDir) {
  return `${recordsDir.replace(/\/+$/, "")}/outbox.jsonl`;
}
async function readState(recordsDir) {
  const raw = await readTextOrNull(statePath(recordsDir));
  if (raw === null) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(raw);
    return {
      lastPullAt: typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : null,
      lastPushAt: typeof parsed.lastPushAt === "string" ? parsed.lastPushAt : null,
      outboxPending: Number.isFinite(parsed.outboxPending) ? Number(parsed.outboxPending) : 0,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      pushedIds: Array.isArray(parsed.pushedIds) ? parsed.pushedIds.filter((id) => typeof id === "string") : [],
      pulledIds: Array.isArray(parsed.pulledIds) ? parsed.pulledIds.filter((id) => typeof id === "string") : []
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}
async function writeState(recordsDir, state) {
  await ensureDir(recordsDir);
  await writeAtomic(statePath(recordsDir), JSON.stringify(state, null, 2));
}
async function readOutbox(recordsDir) {
  const raw = await readTextOrNull(outboxPath(recordsDir));
  if (raw === null || raw.trim() === "") return [];
  const entries = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
    }
  }
  return entries;
}
async function appendOutbox(recordsDir, entry) {
  await ensureDir(recordsDir);
  const { appendFile: appendFile3 } = await import("node:fs/promises");
  await appendFile3(outboxPath(recordsDir), `${JSON.stringify(entry)}
`, "utf8");
}
async function rewriteOutbox(recordsDir, entries) {
  await writeAtomic(outboxPath(recordsDir), entries.map((entry) => JSON.stringify(entry)).join("\n"));
}
function clientOpId(prefix, id) {
  return `${prefix}:${id}`;
}
var TencentSync = class {
  recordsDir;
  host;
  rawClient;
  pullLimit;
  pullScope;
  pullType;
  pushSessionPrefix;
  constructor(options) {
    this.recordsDir = options.recordsDir;
    this.host = options.host;
    this.rawClient = options.client;
    this.pullLimit = options.pullLimit;
    this.pullScope = options.pullScope;
    this.pullType = options.pullType;
    this.pushSessionPrefix = options.pushSessionPrefix;
  }
  async status() {
    const state = await readState(this.recordsDir);
    return { enabled: true, state, url: this.rawClient.baseUrl };
  }
  /** 底层 client（只读使用：ping 等）。 */
  get client() {
    return this.rawClient;
  }
  /** 把一条腾讯 atomic 转成候选内容（type 判断 + 标题化）。 */
  toCandidate(atomic) {
    const content = atomic.content.trim();
    const title = content.slice(0, 60).replace(/\s+/g, " ").replace(/[。；;,.!?]+$/, "");
    const summary = content.length > 220 ? `${content.slice(0, 217)}\u2026` : content;
    const type = atomic.type === "persona" ? "persona" : atomic.type === "instruction" ? "instruction" : "episodic";
    const tags = ["tencent", `t:${type}`, ...atomic.team_id !== void 0 ? [`team:${atomic.team_id}`] : []];
    return {
      title: title === "" ? `\u817E\u8BAF\u8BB0\u5FC6 ${atomic.id}` : title,
      summary,
      content: `# ${title}

> \u6765\u6E90\uFF1A\u817E\u8BAF Agent Memory \u81EA\u52A8\u62BD\u53D6\uFF08atomic ${atomic.id}\uFF09

${content}`,
      tags
    };
  }
  /** 拉取腾讯 L1/L2 增量 → 生成 pending 候选。不 commit。 */
  async pull() {
    let pulled = 0;
    let proposed = 0;
    let skipped = 0;
    const state = await readState(this.recordsDir);
    const processed = new Set(state.pulledIds);
    const errors = [];
    try {
      const atomics = await this.rawClient.listAtomics(this.pullLimit);
      const scenarios = await this.rawClient.listScenarios();
      pulled = atomics.length + scenarios.length;
      for (const atomic of atomics) {
        if (processed.has(atomic.id)) {
          skipped += 1;
          continue;
        }
        const candidate = this.toCandidate(atomic);
        try {
          await this.host.proposeCandidate({
            type: this.pullType,
            scope: this.pullScope,
            title: candidate.title,
            summary: candidate.summary,
            content: candidate.content,
            sourceRefs: [`note:tencent:${atomic.id}`],
            tags: candidate.tags
          });
          proposed += 1;
          processed.add(atomic.id);
        } catch (error) {
          skipped += 1;
          errors.push(`atomic ${atomic.id}: ${error.message}`);
        }
      }
      for (const scenario of scenarios) {
        if (processed.has(`scenario:${scenario.path}`)) {
          skipped += 1;
          continue;
        }
        try {
          const content = await this.rawClient.readScenario(scenario.path);
          await this.host.proposeCandidate({
            type: "process",
            scope: this.pullScope,
            title: `\u573A\u666F\uFF1A${scenario.path}`,
            summary: scenario.summary,
            content: `# \u573A\u666F\uFF1A${scenario.path}

> \u6765\u6E90\uFF1A\u817E\u8BAF Agent Memory L2 \u573A\u666F\uFF08\u81EA\u52A8\u5F52\u7EB3\uFF09

${content || scenario.summary}`,
            sourceRefs: [`note:tencent:scenario:${scenario.path}`],
            tags: ["tencent", "scenario"]
          });
          proposed += 1;
          processed.add(`scenario:${scenario.path}`);
        } catch (error) {
          skipped += 1;
          errors.push(`scenario ${scenario.path}: ${error.message}`);
        }
      }
      state.lastPullAt = (/* @__PURE__ */ new Date()).toISOString();
      state.pulledIds = [...processed].slice(-2e3);
      state.lastError = errors.length > 0 ? `pull ${errors.length} item(s) failed: ${errors[0]}` : null;
      await writeState(this.recordsDir, state);
      await this.host.audit({ type: "tencent.pull", payload: { pulled, proposed, skipped } });
    } catch (error) {
      state.lastError = `pull failed: ${error.message}`;
      await writeState(this.recordsDir, state);
      return { pulled, proposed, skipped, state };
    }
    return { pulled, proposed, skipped, state };
  }
  /** 把本地 accepted 知识 push 到腾讯 conversation 通道。 */
  async push() {
    let pushed = 0;
    let outboxed = 0;
    const state = await readState(this.recordsDir);
    const pushedSet = new Set(state.pushedIds);
    try {
      const entries = await readOutbox(this.recordsDir);
      const remaining = [];
      for (const entry of entries) {
        try {
          await this.rawClient.addConversation(this.sessionFor(entry.id), "user", this.renderPushBody(entry));
          pushed += 1;
          pushedSet.add(entry.id);
          await this.host.audit({ type: "tencent.push", payload: { id: entry.id, fromOutbox: true } });
        } catch {
          remaining.push(entry);
          outboxed += 1;
        }
      }
      await rewriteOutbox(this.recordsDir, remaining);
      const accepted = await this.host.listAcceptedKnowledge();
      for (const record of accepted) {
        if (pushedSet.has(record.id)) continue;
        const opId = clientOpId("push", record.id);
        const entry = {
          op: "push",
          id: record.id,
          clientOpId: opId,
          scope: formatScopeShort(record.scope),
          title: record.title,
          summary: record.summary,
          body: record.body,
          at: (/* @__PURE__ */ new Date()).toISOString()
        };
        try {
          await this.rawClient.addConversation(this.sessionFor(record.id), "user", this.renderPushBody(entry));
          pushed += 1;
          pushedSet.add(record.id);
          await this.host.audit({ type: "tencent.push", payload: { id: record.id, fromOutbox: false } });
        } catch {
          await appendOutbox(this.recordsDir, entry);
          outboxed += 1;
        }
      }
      state.lastPushAt = (/* @__PURE__ */ new Date()).toISOString();
      state.outboxPending = (await readOutbox(this.recordsDir)).length;
      state.pushedIds = [...pushedSet].slice(-2e3);
      state.lastError = null;
      await writeState(this.recordsDir, state);
    } catch (error) {
      state.lastError = `push failed: ${error.message}`;
      await writeState(this.recordsDir, state);
      if (error instanceof TencentError) {
        return { pushed, outboxed, state };
      }
      throw error;
    }
    return { pushed, outboxed, state };
  }
  sessionFor(id) {
    return `${this.pushSessionPrefix}-${id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60)}`;
  }
  renderPushBody(entry) {
    const scope = entry.scope;
    return [
      `\u3010\u8BB0\u5FC6\u5171\u4EAB\u3011${scope} \xB7 ${entry.title}`,
      `\u6458\u8981\uFF1A${entry.summary}`,
      `\u6B63\u6587\uFF1A${entry.body.slice(0, 4e3)}`,
      `\u6765\u6E90\u77E5\u8BC6 id\uFF1A${entry.id}`,
      "(\u7531 dsh-memory-hub \u63A8\u9001\uFF0C\u817E\u8BAF\u4FA7\u81EA\u52A8\u62BD\u53D6\u4E3A\u56E2\u961F\u8BB0\u5FC6)"
    ].join("\n");
  }
};
function formatScopeShort(scope) {
  if (scope === null || typeof scope !== "object") return "unknown";
  const value = scope;
  if (value.level === "global") return "global";
  if (value.level === "domain") return `domain:${value.id ?? "?"}`;
  if (value.level === "project") return `project:${value.workspaceId ?? "?"}`;
  return "unknown";
}

// src/remote/sync.ts
import { appendFile } from "node:fs/promises";
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join6 } from "node:path";
var EMPTY_STATE2 = {
  lastPullAt: null,
  lastPushAt: null,
  lastForgetAt: null,
  lastError: null,
  pulledIds: [],
  pushedIds: [],
  forgottenIds: [],
  externalIds: {}
};
var BOUND = 2e3;
function boundList(list) {
  return list.slice(-BOUND);
}
function boundMap(map) {
  const keys = Object.keys(map);
  if (keys.length <= BOUND) return map;
  const next = {};
  for (const key of keys.slice(-BOUND)) next[key] = map[key];
  return next;
}
function safeProviderId(providerId) {
  return providerId.replace(/[^A-Za-z0-9_.-]/g, "-");
}
function formatScopeShort2(scope) {
  if (scope.level === "global") return "global";
  if (scope.level === "domain") return `domain:${scope.id}`;
  return `project:${scope.workspaceId}`;
}
function scopeMatchesPattern(pattern, scope) {
  if (pattern.endsWith("*")) return scope.startsWith(pattern.slice(0, -1));
  return pattern === scope;
}
var RemoteSync = class {
  providerId;
  dir;
  host;
  adapter;
  settings;
  origin;
  citationCount;
  constructor(options) {
    this.providerId = options.providerId;
    this.dir = join6(options.recordsDir.replace(/\/+$/, ""), "remote", safeProviderId(options.providerId));
    this.host = options.host;
    this.adapter = options.adapter;
    this.settings = options.settings;
    this.origin = options.origin ?? { coreId: null, workspaceId: null, hubKey: "local" };
    this.citationCount = options.citationCount ?? (() => 0);
  }
  /* ---------------- 状态文件 ---------------- */
  statePath() {
    return join6(this.dir, "state.json");
  }
  outboxPath() {
    return join6(this.dir, "outbox.jsonl");
  }
  orphansPath() {
    return join6(this.dir, "orphans.jsonl");
  }
  async readState() {
    const raw = await readTextOrNull(this.statePath());
    if (raw === null) return { ...EMPTY_STATE2, externalIds: {} };
    try {
      const parsed = JSON.parse(raw);
      const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      const externalIds = {};
      if (parsed.externalIds !== null && typeof parsed.externalIds === "object") {
        for (const [key, value] of Object.entries(parsed.externalIds)) {
          if (typeof value === "string" && value !== "") externalIds[key] = value;
        }
      }
      return {
        lastPullAt: typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === "string" ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === "string" ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds),
        externalIds
      };
    } catch {
      return { ...EMPTY_STATE2, externalIds: {} };
    }
  }
  async writeState(state) {
    await ensureDir(this.dir);
    await writeAtomic(this.statePath(), JSON.stringify(state, null, 2));
  }
  async readOutbox() {
    const raw = await readTextOrNull(this.outboxPath());
    if (raw === null || raw.trim() === "") return [];
    const entries = [];
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      try {
        const parsed = JSON.parse(line);
        if ((parsed.op === "push" || parsed.op === "forget") && typeof parsed.knowledgeId === "string" && typeof parsed.clientOpId === "string") {
          entries.push(parsed);
        }
      } catch {
      }
    }
    return entries;
  }
  async writeOutbox(entries) {
    await ensureDir(this.dir);
    await writeAtomic(this.outboxPath(), entries.map((entry) => JSON.stringify(entry)).join("\n"));
  }
  async appendOutbox(entry) {
    await ensureDir(this.dir);
    await appendFile(this.outboxPath(), `${JSON.stringify(entry)}
`, "utf8");
  }
  async readOrphans() {
    const raw = await readTextOrNull(this.orphansPath());
    if (raw === null || raw.trim() === "") return [];
    const entries = [];
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
      }
    }
    return entries;
  }
  async recordOrphan(entry) {
    await ensureDir(this.dir);
    await appendFile(this.orphansPath(), `${JSON.stringify(entry)}
`, "utf8");
  }
  /* ---------------- 角色守卫 ---------------- */
  requireRole(role) {
    if (!this.settings.roles.includes(role)) {
      throw new MemoryError(
        "INVALID_INPUT",
        `provider "${this.providerId}" does not have the "${role}" role (declared: ${this.settings.roles.join(", ") || "none"})`
      );
    }
  }
  /* ---------------- 投影 ---------------- */
  /** mirror 的投影过滤：scopes / types / exclude_tags。空 scopes = 不允许任何分发。 */
  projectionAllows(record) {
    const projection = this.settings.projection;
    if (projection.scopes.length === 0) return false;
    const scope = formatScopeShort2(record.scope);
    if (!projection.scopes.some((pattern) => scopeMatchesPattern(pattern, scope))) return false;
    if (projection.types.length > 0 && !projection.types.includes(record.type)) return false;
    if (projection.exclude_tags.some((tag) => record.tags.includes(tag))) return false;
    return true;
  }
  remoteRecordFrom(entry) {
    const body = this.settings.mirror.include_body ? entry.body.slice(0, this.settings.mirror.max_body_chars) : "";
    return {
      externalId: "",
      title: entry.title,
      summary: entry.summary,
      body,
      scope: entry.scope,
      tags: entry.tags,
      raw: { knowledgeId: entry.knowledgeId, version: entry.version }
    };
  }
  entryFromRecord(record) {
    return {
      op: "push",
      knowledgeId: record.id,
      clientOpId: `${this.providerId}:push:${record.id}:${record.version}`,
      version: record.version,
      title: record.title,
      summary: record.summary,
      body: record.body,
      scope: formatScopeShort2(record.scope),
      tags: this.withCoordinateTags(record),
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /* ---------------- 坐标编码（§5.8.1） ---------------- */
  /**
   * mirror 坐标 tags：金字塔结构序列化成扁平远端池上的坐标。
   * `mh:` 是协议保留前缀——用户标签里的 `mh:*` 一律剥掉（防止伪造来历）。
   * 在 outbox 入队时计算，重放自然保留坐标。
   */
  withCoordinateTags(record) {
    const base = record.tags.filter((tag) => !tag.startsWith("mh:"));
    if (!this.settings.mirror.coordinate_tags) return base;
    const tags = [...base, `mh:scope:${record.scope.level}`, `mh:type:${record.type}`];
    if (record.scope.level === "project") tags.push(`mh:ws:${record.scope.workspaceId}`);
    if (record.scope.level === "domain") tags.push(`mh:domain:${record.scope.id}`);
    if (this.origin.coreId !== null) tags.push(`mh:core:${this.origin.coreId}`);
    tags.push(`mh:from:${this.origin.hubKey}`);
    return [...new Set(tags)];
  }
  /**
   * pull 侧作用域还原（§5.8.2 非对称映射的另一半）：
   * 远端坐标 → **拉取者自己的**作用域字符串；解析不出有效坐标退 feed.scope。
   * 恶意/损坏的坐标（未知 level、缺 ws/domain）一律按"没有坐标"处理。
   */
  scopeFromTags(tags) {
    if (!this.settings.feed.scope_from_tags) return null;
    const value = (prefix) => tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length);
    const level = value("mh:scope:");
    if (level === "global") return "global";
    if (level === "project") {
      const workspaceId = value("mh:ws:");
      return workspaceId !== void 0 && workspaceId !== "" ? `project:${workspaceId}` : null;
    }
    if (level === "domain") {
      const domain = value("mh:domain:");
      return domain !== void 0 && domain !== "" ? `domain:${domain}` : null;
    }
    return null;
  }
  /* ---------------- feed：pull ---------------- */
  /** 拉远端记录 → 本地 pending 候选。绝不 commit；只有 propose 成功才推进游标。 */
  async pull() {
    this.requireRole("feed");
    const list = requireMethod(this.adapter, "list");
    const state = await this.readState();
    const processed = new Set(state.pulledIds);
    const errors = [];
    let pulled = 0;
    let proposed = 0;
    let skipped = 0;
    try {
      const page = await list({ limit: this.settings.feed.limit, scope: this.settings.feed.scope });
      pulled = page.items.length;
      if (page.resetRequired === true) processed.clear();
      for (const record of page.items) {
        if (processed.has(record.externalId)) {
          skipped += 1;
          continue;
        }
        const content = record.body.trim() !== "" ? record.body : record.summary;
        const title = record.title.trim() !== "" ? record.title : record.summary.slice(0, 60).replace(/\s+/g, " ").trim() || `\u8FDC\u7AEF\u8BB0\u5FC6 ${record.externalId}`;
        const summary = record.summary.trim() !== "" ? record.summary : title;
        try {
          await this.host.proposeCandidate({
            type: this.settings.feed.type,
            // 作用域还原：远端坐标 → 拉取者自己的结构；无坐标退 feed.scope。
            scope: this.scopeFromTags(record.tags) ?? this.settings.feed.scope,
            title,
            summary,
            content: `# ${title}

> \u6765\u6E90\uFF1A\u8FDC\u7AEF provider ${this.providerId}\uFF08externalId ${record.externalId}\uFF09

${content}`,
            sourceRefs: [`note:remote:${this.providerId}:${record.externalId}`],
            tags: [this.providerId, ...this.settings.feed.tags]
          });
          proposed += 1;
          processed.add(record.externalId);
        } catch (error) {
          skipped += 1;
          errors.push(`${record.externalId}: ${error.message}`);
        }
      }
      state.lastPullAt = (/* @__PURE__ */ new Date()).toISOString();
      state.pulledIds = boundList([...processed]);
      state.lastError = errors.length > 0 ? `pull: ${errors.length} item(s) failed: ${errors[0]}` : null;
      await this.writeState(state);
      await this.host.audit({
        type: "remote.pull",
        payload: { provider: this.providerId, pulled, proposed, skipped }
      });
    } catch (error) {
      state.lastError = `pull failed: ${error.message}`;
      await this.writeState(state);
      return { pulled, proposed, skipped, errors: [state.lastError] };
    }
    return { pulled, proposed, skipped, errors };
  }
  /* ---------------- mirror：push ---------------- */
  /** 本地 accepted → 远端 append。失败进 outbox；先重放上次遗留。 */
  async push() {
    this.requireRole("mirror");
    const append = requireMethod(this.adapter, "append");
    const state = await this.readState();
    let pushed = 0;
    let outboxed = 0;
    let replayed = 0;
    const entries = await this.readOutbox();
    const remaining = [];
    for (const entry of entries) {
      if (entry.op !== "push") {
        remaining.push(entry);
        continue;
      }
      try {
        const result = await append(
          this.remoteRecordFrom({
            knowledgeId: entry.knowledgeId,
            version: entry.version,
            title: entry.title,
            summary: entry.summary,
            body: entry.body,
            scope: entry.scope,
            tags: entry.tags
          }),
          { idempotencyKey: entry.clientOpId }
        );
        pushed += 1;
        replayed += 1;
        state.pushedIds = [...new Set(state.pushedIds).add(entry.knowledgeId)];
        if (result.externalId !== "") state.externalIds[entry.knowledgeId] = result.externalId;
      } catch {
        remaining.push(entry);
        outboxed += 1;
      }
    }
    await this.writeOutbox(remaining);
    const records = await this.host.allKnowledge();
    const pushedSet = new Set(state.pushedIds);
    const requireCitations = this.settings.mirror.require_citations;
    let gated = 0;
    for (const record of records) {
      if (record.status !== "accepted") continue;
      if (pushedSet.has(record.id)) continue;
      if (!this.projectionAllows(record)) continue;
      if (requireCitations > 0 && this.citationCount(record.id) < requireCitations) {
        gated += 1;
        continue;
      }
      const entry = this.entryFromRecord(record);
      try {
        const result = await append(this.remoteRecordFrom({
          knowledgeId: record.id,
          version: record.version,
          title: record.title,
          summary: record.summary,
          body: record.body,
          scope: entry.scope,
          tags: entry.tags
        }), { idempotencyKey: entry.clientOpId });
        pushed += 1;
        pushedSet.add(record.id);
        if (result.externalId !== "") state.externalIds[record.id] = result.externalId;
      } catch {
        await this.appendOutbox(entry);
        outboxed += 1;
      }
    }
    state.lastPushAt = (/* @__PURE__ */ new Date()).toISOString();
    state.pushedIds = boundList([...pushedSet]);
    state.externalIds = boundMap(state.externalIds);
    state.lastError = null;
    await this.writeState(state);
    await this.host.audit({
      type: "remote.push",
      payload: { provider: this.providerId, pushed, outboxed, replayed, ...gated > 0 ? { gated } : {} }
    });
    return { pushed, outboxed, replayed, gated };
  }
  /* ---------------- mirror：forget（作废传播） ---------------- */
  /**
   * 传播模式候选：deprecated（受 on_deprecate）/ superseded（受 on_merge）且**已镜像过**
   * 且尚未 forget。没镜像过的条目不产生 forget（否则 outbox 里全是无效操作）。
   */
  collectForgetCandidates(state, records) {
    const pushed = new Set(state.pushedIds);
    const forgotten = new Set(state.forgottenIds);
    const out = [];
    for (const record of records) {
      if (!pushed.has(record.id)) continue;
      if (forgotten.has(record.id)) continue;
      const isDeprecated = this.settings.forget.on_deprecate && record.status === "deprecated";
      const isMerged = this.settings.forget.on_merge && record.status === "superseded";
      if (!isDeprecated && !isMerged) continue;
      out.push({
        knowledgeId: record.id,
        version: record.version,
        title: record.title,
        scope: formatScopeShort2(record.scope),
        reason: record.deprecatedReason ?? (record.supersededBy !== null ? `merged into ${record.supersededBy}` : "deprecated locally")
      });
    }
    out.sort((a, b) => a.knowledgeId.localeCompare(b.knowledgeId));
    return out;
  }
  async forgetOne(state, candidate, reason) {
    const externalId = state.externalIds[candidate.knowledgeId] ?? null;
    if (hasCapability(this.adapter, "write.delete") && externalId !== null) {
      try {
        const del = requireMethod(this.adapter, "delete");
        await del(externalId, { reason, scope: candidate.scope });
        return { knowledgeId: candidate.knowledgeId, externalId, action: "delete" };
      } catch (error) {
        return this.forgetFailure(state, candidate, externalId, reason, error);
      }
    }
    let markerNote = "provider does not declare write.delete";
    if (hasCapability(this.adapter, "write.append")) {
      try {
        const append = requireMethod(this.adapter, "append");
        const markerKey = `${this.providerId}:forget:${candidate.knowledgeId}:${candidate.version}`;
        const appended = await append(
          {
            externalId: "",
            title: `\u3010\u5DF2\u4F5C\u5E9F\u3011${candidate.title}`,
            summary: candidate.reason,
            body: `\u672C\u5730\u77E5\u8BC6 ${candidate.knowledgeId} \u5DF2\u4F5C\u5E9F\uFF1A${reason}
\uFF08\u7531 dsh-memory-hub \u4F20\u64AD\uFF1B\u539F\u526F\u672C\u65E0\u6CD5\u5220\u9664\uFF0C\u8BF7\u4EBA\u5DE5\u5728\u8FDC\u7AEF\u5904\u7406\uFF09`,
            scope: candidate.scope,
            tags: ["deprecated"],
            raw: { knowledgeId: candidate.knowledgeId, forgetOf: true }
          },
          { idempotencyKey: markerKey }
        );
        markerNote = `deprecation marker appended (${appended.externalId}); original copy remains on the remote`;
      } catch (error) {
        markerNote = `deprecation marker failed: ${error.message}`;
      }
    }
    await this.recordOrphan({
      knowledgeId: candidate.knowledgeId,
      externalId,
      reason: candidate.reason,
      cause: "unsupported",
      detail: markerNote,
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return {
      knowledgeId: candidate.knowledgeId,
      externalId,
      action: hasCapability(this.adapter, "write.append") ? "marker" : "orphan",
      detail: markerNote
    };
  }
  /** forget 的失败分流：unreachable → outbox 等重试；其余 → 孤儿（不重试无意义的请求）。 */
  async forgetFailure(state, candidate, externalId, reason, error) {
    if (isRemoteError(error) && error.kind === "unreachable") {
      await this.appendOutbox({
        op: "forget",
        knowledgeId: candidate.knowledgeId,
        clientOpId: `${this.providerId}:forget:${candidate.knowledgeId}:${candidate.version}`,
        version: candidate.version,
        title: candidate.title,
        summary: candidate.reason,
        body: "",
        scope: candidate.scope,
        tags: [],
        reason,
        at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return {
        knowledgeId: candidate.knowledgeId,
        externalId,
        action: "queued",
        detail: "remote unreachable; queued for replay"
      };
    }
    const cause = isRemoteError(error) ? error.kind === "unsupported" || error.kind === "conflict" || error.kind === "invalid" || error.kind === "unauthorized" ? error.kind : "error" : "error";
    await this.recordOrphan({
      knowledgeId: candidate.knowledgeId,
      externalId,
      reason: candidate.reason,
      cause,
      detail: error.message,
      at: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { knowledgeId: candidate.knowledgeId, externalId, action: "orphan", detail: error.message };
  }
  /**
   * forget 主入口。
   *
   * - 无 `knowledgeId`：传播模式，受 `forget.on_deprecate` / `on_merge` / `max_per_run` 控制；
   *   `dryRun: true` 返回将受影响的条目与计划动作，**零副作用**。
   * - 有 `knowledgeId`：人工显式遗忘，绕过开关；从未镜像过的条目如实报 skipped，不产生幽灵请求。
   */
  async forget(opts = {}) {
    this.requireRole("mirror");
    const state = await this.readState();
    const dryRun = opts.dryRun === true;
    const reason = (opts.reason ?? "").trim() !== "" ? (opts.reason ?? "").trim() : "deprecated locally";
    if (opts.knowledgeId !== void 0) {
      const records2 = await this.host.allKnowledge();
      const record = records2.find((item2) => item2.id === opts.knowledgeId);
      if (record === void 0) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [
            {
              knowledgeId: opts.knowledgeId,
              externalId: null,
              action: "skipped",
              detail: "knowledge entry not found locally"
            }
          ]
        };
      }
      if (!new Set(state.pushedIds).has(record.id)) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [
            {
              knowledgeId: record.id,
              externalId: null,
              action: "skipped",
              detail: "never mirrored to this provider; nothing to forget remotely"
            }
          ]
        };
      }
      if (new Set(state.forgottenIds).has(record.id)) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 0,
          outboxed: 0,
          items: [{ knowledgeId: record.id, externalId: null, action: "skipped", detail: "already forgotten" }]
        };
      }
      if (dryRun) {
        return {
          dryRun,
          forgotten: 0,
          orphans: 0,
          pending: 1,
          outboxed: 0,
          items: [
            {
              knowledgeId: record.id,
              externalId: state.externalIds[record.id] ?? null,
              action: hasCapability(this.adapter, "write.delete") ? "delete" : hasCapability(this.adapter, "write.append") ? "marker" : "orphan",
              detail: "planned action (dry run)"
            }
          ]
        };
      }
      const item = await this.forgetOne(state, {
        knowledgeId: record.id,
        version: record.version,
        title: record.title,
        scope: formatScopeShort2(record.scope),
        reason
      }, reason);
      if (item.action === "delete") {
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(record.id)]);
      } else if (item.action === "marker" || item.action === "orphan") {
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(record.id)]);
      }
      state.lastForgetAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.writeState(state);
      await this.host.audit({
        type: "remote.forget",
        payload: {
          provider: this.providerId,
          forgotten: item.action === "delete" ? 1 : 0,
          orphans: item.action === "marker" || item.action === "orphan" ? 1 : 0,
          pending: 0,
          outboxed: item.action === "queued" ? 1 : 0,
          dryRun
        }
      });
      return {
        dryRun,
        forgotten: item.action === "delete" ? 1 : 0,
        orphans: item.action === "marker" || item.action === "orphan" ? 1 : 0,
        pending: 0,
        outboxed: item.action === "queued" ? 1 : 0,
        items: [item]
      };
    }
    const records = await this.host.allKnowledge();
    if (dryRun) {
      const candidates2 = this.collectForgetCandidates(state, records);
      const items2 = [];
      for (const candidate of candidates2) {
        const externalId = state.externalIds[candidate.knowledgeId] ?? null;
        const action = hasCapability(this.adapter, "write.delete") ? externalId !== null ? "delete" : "orphan" : hasCapability(this.adapter, "write.append") ? "marker" : "orphan";
        items2.push({ knowledgeId: candidate.knowledgeId, externalId, action, detail: "planned action (dry run)" });
      }
      return { dryRun, forgotten: 0, orphans: 0, pending: candidates2.length, outboxed: 0, items: items2 };
    }
    let forgotten = 0;
    let orphans = 0;
    let outboxed = 0;
    const items = [];
    const entries = await this.readOutbox();
    const remaining = [];
    for (const entry of entries) {
      if (entry.op !== "forget") {
        remaining.push(entry);
        continue;
      }
      const externalId = state.externalIds[entry.knowledgeId] ?? null;
      if (!hasCapability(this.adapter, "write.delete") || externalId === null) {
        await this.recordOrphan({
          knowledgeId: entry.knowledgeId,
          externalId,
          reason: entry.reason ?? "deprecated locally",
          cause: "unsupported",
          detail: "forget replayed but provider cannot delete; moved to orphans",
          at: (/* @__PURE__ */ new Date()).toISOString()
        });
        orphans += 1;
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)]);
        items.push({ knowledgeId: entry.knowledgeId, externalId, action: "orphan", detail: "converted from outbox" });
        continue;
      }
      try {
        const del = requireMethod(this.adapter, "delete");
        await del(externalId, { reason: entry.reason ?? "deprecated locally", scope: entry.scope });
        forgotten += 1;
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)]);
        items.push({ knowledgeId: entry.knowledgeId, externalId, action: "delete", detail: "replayed from outbox" });
      } catch (error) {
        if (isRemoteError(error) && error.kind === "unreachable") {
          remaining.push(entry);
          outboxed += 1;
          items.push({ knowledgeId: entry.knowledgeId, externalId, action: "queued", detail: "still unreachable" });
        } else {
          await this.recordOrphan({
            knowledgeId: entry.knowledgeId,
            externalId,
            reason: entry.reason ?? "deprecated locally",
            cause: isRemoteError(error) ? error.kind === "unreachable" ? "error" : error.kind : "error",
            detail: error.message,
            at: (/* @__PURE__ */ new Date()).toISOString()
          });
          orphans += 1;
          state.forgottenIds = boundList([...new Set(state.forgottenIds).add(entry.knowledgeId)]);
          items.push({ knowledgeId: entry.knowledgeId, externalId, action: "orphan", detail: error.message });
        }
      }
    }
    await this.writeOutbox(remaining);
    const candidates = this.collectForgetCandidates(state, records);
    const cap = this.settings.forget.max_per_run;
    const slice = cap === 0 ? candidates : candidates.slice(0, cap);
    for (const candidate of slice) {
      const item = await this.forgetOne(state, candidate, candidate.reason || reason);
      items.push(item);
      if (item.action === "delete") {
        forgotten += 1;
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(candidate.knowledgeId)]);
      } else if (item.action === "marker" || item.action === "orphan") {
        orphans += 1;
        state.forgottenIds = boundList([...new Set(state.forgottenIds).add(candidate.knowledgeId)]);
      } else if (item.action === "queued") {
        outboxed += 1;
      }
    }
    state.lastForgetAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeState(state);
    await this.host.audit({
      type: "remote.forget",
      payload: {
        provider: this.providerId,
        forgotten,
        orphans,
        pending: Math.max(0, candidates.length - slice.length),
        outboxed,
        dryRun
      }
    });
    return { dryRun, forgotten, orphans, pending: Math.max(0, candidates.length - slice.length), outboxed, items };
  }
  /* ---------------- 状态 ---------------- */
  async status() {
    const state = await this.readState();
    const orphans = await this.readOrphans();
    const outbox = await this.readOutbox();
    return {
      provider: this.providerId,
      kind: this.adapter.kind,
      roles: [...this.settings.roles],
      lastPullAt: state.lastPullAt,
      lastPushAt: state.lastPushAt,
      lastForgetAt: state.lastForgetAt,
      lastError: state.lastError,
      mirrored: state.pushedIds.length,
      forgotten: state.forgottenIds.length,
      outboxPending: outbox.length,
      orphans: orphans.length
    };
  }
};
async function readRemoteSyncSnapshot(recordsDir, providerId) {
  const dir = join6(recordsDir.replace(/\/+$/, ""), "remote", safeProviderId(providerId));
  const raw = await readTextOrNull(join6(dir, "state.json"));
  let state = EMPTY_STATE2;
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      state = {
        ...EMPTY_STATE2,
        lastPullAt: typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === "string" ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === "string" ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds)
      };
    } catch {
    }
  }
  const countLines = async (name) => {
    const text = await readTextOrNull(join6(dir, name));
    if (text === null || text.trim() === "") return 0;
    return text.split("\n").filter((line) => line.trim() !== "").length;
  };
  return {
    provider: providerId,
    lastPullAt: state.lastPullAt,
    lastPushAt: state.lastPushAt,
    lastForgetAt: state.lastForgetAt,
    lastError: state.lastError,
    outboxPending: await countLines("outbox.jsonl"),
    orphans: await countLines("orphans.jsonl"),
    mirrored: state.pushedIds.length
  };
}
function readRemoteSyncStateSync(recordsDir, providerId) {
  const dir = join6(recordsDir.replace(/\/+$/, ""), "remote", safeProviderId(providerId));
  const readSmall = (name) => {
    try {
      return readFileSync3(join6(dir, name), "utf8");
    } catch {
      return null;
    }
  };
  const raw = readSmall("state.json");
  let state = EMPTY_STATE2;
  if (raw !== null && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      state = {
        ...EMPTY_STATE2,
        lastPullAt: typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : null,
        lastPushAt: typeof parsed.lastPushAt === "string" ? parsed.lastPushAt : null,
        lastForgetAt: typeof parsed.lastForgetAt === "string" ? parsed.lastForgetAt : null,
        lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
        pulledIds: strings(parsed.pulledIds),
        pushedIds: strings(parsed.pushedIds),
        forgottenIds: strings(parsed.forgottenIds)
      };
    } catch {
    }
  }
  const countLines = (name) => {
    const text = readSmall(name);
    if (text === null || text.trim() === "") return 0;
    return text.split("\n").filter((line) => line.trim() !== "").length;
  };
  return {
    provider: providerId,
    lastPullAt: state.lastPullAt,
    lastPushAt: state.lastPushAt,
    lastForgetAt: state.lastForgetAt,
    lastError: state.lastError,
    outboxPending: countLines("outbox.jsonl"),
    orphans: countLines("orphans.jsonl"),
    mirrored: state.pushedIds.length,
    pushedIds: state.pushedIds,
    forgottenIds: state.forgottenIds
  };
}
function countPendingForget(records, forget, pushedIds, forgottenIds) {
  const pushed = new Set(pushedIds);
  const forgotten = new Set(forgottenIds);
  let count = 0;
  for (const record of records) {
    if (!pushed.has(record.id)) continue;
    if (forgotten.has(record.id)) continue;
    const isDeprecated = forget.on_deprecate && record.status === "deprecated";
    const isMerged = forget.on_merge && record.status === "superseded";
    if (isDeprecated || isMerged) count += 1;
  }
  return count;
}
async function migrateLegacyRemoteState(recordsDir, providerId) {
  const root = recordsDir.replace(/\/+$/, "");
  const newStatePath = join6(root, "remote", safeProviderId(providerId), "state.json");
  if (await readTextOrNull(newStatePath) !== null) {
    return { migrated: false, pulled: 0, pushed: 0, reason: "new state already exists" };
  }
  const legacyRaw = await readTextOrNull(join6(root, "tencent-state.json"));
  if (legacyRaw === null || legacyRaw.trim() === "") {
    return { migrated: false, pulled: 0, pushed: 0, reason: "no legacy state file" };
  }
  try {
    const legacy = JSON.parse(legacyRaw);
    const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    const state = {
      ...EMPTY_STATE2,
      lastPullAt: typeof legacy.lastPullAt === "string" ? legacy.lastPullAt : null,
      lastPushAt: typeof legacy.lastPushAt === "string" ? legacy.lastPushAt : null,
      lastError: typeof legacy.lastError === "string" ? legacy.lastError : null,
      pulledIds: strings(legacy.pulledIds),
      pushedIds: strings(legacy.pushedIds)
    };
    await ensureDir(join6(root, "remote", safeProviderId(providerId)));
    await writeAtomic(newStatePath, JSON.stringify(state, null, 2));
    return { migrated: true, pulled: state.pulledIds.length, pushed: state.pushedIds.length };
  } catch (error) {
    return {
      migrated: false,
      pulled: 0,
      pushed: 0,
      reason: `legacy state unparsable: ${error.message}`
    };
  }
}

// src/scenario.ts
import { basename as basename4, join as join7 } from "node:path";
var DEFAULT_MAX_PER_SCENARIO = 50;
var DEFAULT_MIN_ENTRIES = 2;
function topicOf(record) {
  const preferred = ["topic:", "domain:", "batch:"];
  for (const prefix of preferred) {
    const tag = record.tags.find((value) => value.startsWith(prefix));
    if (tag !== void 0) {
      const value = tag.slice(prefix.length).trim();
      if (value !== "") return { topic: value, ranked: true };
    }
  }
  return { topic: record.type, ranked: false };
}
function safeFileStem(topic) {
  const stem = topic.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80);
  return stem === "" ? "untitled" : stem;
}
function renderScenario(topic, records) {
  const lines = [
    `# \u573A\u666F\uFF1A${topic}`,
    "",
    "> \u672C\u6587\u4EF6\u7531 Memory Hub \u81EA\u52A8\u751F\u6210\uFF08\u6D3E\u751F\u89C6\u56FE\uFF0C\u53EF\u968F\u65F6\u5220\u9664\u91CD\u5EFA\uFF09\u3002",
    "> \u5B83\u53EA\u662F\u7D22\u5F15\u4E0E\u6458\u8981\uFF1B\u6B63\u6587\u7EC6\u8282\u8BF7\u7528 memory_get \u8BFB\u53D6\u5BF9\u5E94\u6761\u76EE\u3002",
    "",
    `\u6761\u76EE\u6570\uFF1A${records.length}`,
    "",
    "## \u6761\u76EE\u7D22\u5F15",
    ""
  ];
  for (const record of records) {
    lines.push(`- [${record.id}@${record.version}] ${record.type} \xB7 ${record.title}`);
    lines.push(`  ${record.summary}`);
  }
  lines.push("");
  return lines.join("\n");
}
var ScenarioBuilder = class {
  options;
  constructor(options = {}) {
    this.options = {
      scenarioDir: options.scenarioDir ?? "scenario",
      maxEntriesPerScenario: options.maxEntriesPerScenario ?? DEFAULT_MAX_PER_SCENARIO,
      minEntries: options.minEntries ?? DEFAULT_MIN_ENTRIES
    };
  }
  get enabled() {
    return this.options.scenarioDir.trim() !== "";
  }
  /** 从知识记录构建/重建全部场景文件。只写 scenario 目录。 */
  async rebuild(root, records) {
    if (!this.enabled) return { scenarios: [], skipped: 0 };
    const accepted = records.filter((record) => record.status === "accepted");
    const buckets = /* @__PURE__ */ new Map();
    for (const record of accepted) {
      const { topic } = topicOf(record);
      const list = buckets.get(topic) ?? [];
      list.push(record);
      buckets.set(topic, list);
    }
    const scenarios = [];
    let skipped = 0;
    for (const [topic, list] of buckets) {
      if (list.length < this.options.minEntries) {
        skipped += 1;
        continue;
      }
      const sorted = [...list].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, this.options.maxEntriesPerScenario);
      const dir2 = join7(root, this.options.scenarioDir);
      await ensureDir(dir2);
      const path = join7(dir2, `${safeFileStem(topic)}.md`);
      await writeAtomic(path, renderScenario(topic, sorted));
      scenarios.push({ topic, path, entries: sorted.length, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const { readdir: readdir2 } = await import("node:fs/promises");
    const dir = join7(root, this.options.scenarioDir);
    const keep = new Set(scenarios.map((entry) => basename4(entry.path)));
    try {
      for (const name of await readdir2(dir)) {
        if (!name.endsWith(".md")) continue;
        if (keep.has(name)) continue;
        const { rm: rm4 } = await import("node:fs/promises");
        await rm4(join7(dir, name), { force: true });
      }
    } catch {
    }
    return { scenarios, skipped };
  }
  /** 只读列出当前场景目录。 */
  async list(root) {
    if (!this.enabled) return [];
    const { readdir: readdir2 } = await import("node:fs/promises");
    const dir = join7(root, this.options.scenarioDir);
    try {
      const names = await readdir2(dir);
      return names.filter((name) => name.endsWith(".md")).sort().map((name) => ({ name, path: join7(dir, name) }));
    } catch {
      return [];
    }
  }
};

// src/credentials.ts
var import_yaml3 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync4 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join8 } from "node:path";
function dshCredentialPath(env = process.env) {
  const home = env.DSH_HOME?.trim() || join8(homedir2(), ".dsh");
  return join8(home, ".credentials.yaml");
}
function readDshCredential(name, env = process.env) {
  try {
    const raw = readFileSync4(dshCredentialPath(env), "utf8");
    const doc = (0, import_yaml3.parse)(raw);
    const value = doc?.refs?.[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  } catch {
    return null;
  }
}
function resolveApiKeyEnv(name, env = process.env) {
  const direct = env[name]?.trim();
  if (direct !== void 0 && direct !== "") return direct;
  return readDshCredential(name, env);
}

// src/service.ts
var PLUGIN_VERSION = package_default.version;
var SCHEDULED_STATES = /* @__PURE__ */ new Set(["scheduled"]);
var DIGEST_CHARS = 700;
var SECTION_CHARS = 2e3;
var PANEL_PENDING_LIMIT = 200;
var MemoryService = class {
  ctx;
  hub;
  store;
  ledger;
  customWorkspaces;
  coreId;
  /** 金字塔上级链：按 近→远 排列的祖先核心 pack（父、祖父、…）。 */
  parents = [];
  sessions = /* @__PURE__ */ new Map();
  tasks;
  citationKeys = /* @__PURE__ */ new Set();
  citations;
  reflectSource;
  reflectState;
  /** 腾讯桥（lazy：仅 tencent.enabled 时创建）。 */
  tencentBridge = null;
  /** 多厂商 provider 注册表（lazy；关闭时为零网络、零 adapter）。 */
  remoteRegistry = null;
  constructor(options) {
    this.ctx = options.ctx;
    this.hub = options.hub;
    this.store = options.store;
    this.ledger = options.ledger;
    this.customWorkspaces = options.workspaces;
    this.coreId = options.coreId ?? null;
    this.reflectSource = options.reflectSource ?? null;
    this.reflectState = options.reflectState ?? null;
    this.tasks = options.ledgerState.tasks;
    this.citations = options.ledgerState.citations;
    for (const citation of this.citations) {
      this.citationKeys.add(citationKey(citation.taskId, citation.knowledgeId, citation.version));
    }
  }
  /** 最近的父核心 pack（金字塔第一级）。 */
  get parent() {
    return this.parents[0] ?? null;
  }
  /** 最近的父核心 id。 */
  get parentCoreId() {
    return this.parents[0]?.coreId ?? null;
  }
  /** 全部祖先核心 id，按 近→远 排列。 */
  get parentCoreIds() {
    return this.parents.map((parent) => parent.coreId).filter((id) => id !== null);
  }
  /** 挂接单个父核心 pack（向后兼容；等价于 setParents([parent])）。 */
  setParent(parent) {
    this.parents = parent === null ? [] : [parent];
  }
  /** 挂接金字塔上级链：parents 按 近→远 排列（父、祖父、…）。由 runtime 在所有核心打开后调用。 */
  setParents(parents) {
    this.parents = parents;
  }
  /** 配置热更新：由 runtime 刷新工作区清单（新增/移除 core 与子工作区）。 */
  updateWorkspaces(workspaces) {
    this.customWorkspaces = workspaces;
  }
  get activeWorkspaces() {
    return this.customWorkspaces ?? this.hub.config.workspaces;
  }
  packFor(sessionId) {
    return this.sessions.get(sessionId)?.pack ?? "";
  }
  stateFor(sessionId) {
    return this.sessions.get(sessionId);
  }
  async resolveWorkspace(agent) {
    let directory = "";
    const workingDirectory = this.ctx.get("workingDirectory");
    try {
      directory = workingDirectory?.get(agent.session) ?? "";
    } catch {
      directory = "";
    }
    if (directory === "") directory = workingDirectory?.defaultDirectory ?? "";
    let resolved = directory;
    try {
      resolved = await realpath(directory);
    } catch {
    }
    const compared = normalizeForCompare(resolved);
    let match = {
      id: null,
      root: null,
      domains: [],
      admin: false,
      path: resolved,
      registered: false,
      coreId: null,
      parentCoreId: null,
      parentCoreIds: []
    };
    let bestLength = -1;
    for (const workspace of this.activeWorkspaces) {
      if (!workspace.enabled) continue;
      let root = workspace.root;
      try {
        root = await realpath(workspace.root);
      } catch {
      }
      const rootCompared = normalizeForCompare(root);
      if (!containsPath(rootCompared, compared)) continue;
      if (rootCompared.length > bestLength) {
        bestLength = rootCompared.length;
        const coreId = workspace.core_id ?? workspace.id;
        match = {
          id: workspace.id,
          root,
          domains: workspace.domains,
          admin: workspace.admin,
          path: resolved,
          registered: true,
          coreId,
          parentCoreId: workspace.id === this.coreId ? this.parentCoreId : null,
          parentCoreIds: workspace.id === this.coreId ? this.parentCoreIds : []
        };
      }
    }
    return match;
  }
  matchWorkspaceSync(agent) {
    let directory = "";
    const workingDirectory = this.ctx.get("workingDirectory");
    try {
      directory = workingDirectory?.get(agent.session) ?? "";
    } catch {
      directory = "";
    }
    if (directory === "") directory = workingDirectory?.defaultDirectory ?? "";
    const compared = normalizeForCompare(directory);
    let match = {
      id: null,
      root: null,
      domains: [],
      admin: false,
      path: directory,
      registered: false,
      coreId: null,
      parentCoreId: null,
      parentCoreIds: []
    };
    let bestLength = -1;
    for (const workspace of this.activeWorkspaces) {
      if (!workspace.enabled) continue;
      const rootCompared = normalizeForCompare(workspace.root);
      if (!containsPath(rootCompared, compared)) continue;
      if (rootCompared.length > bestLength) {
        bestLength = rootCompared.length;
        match = {
          id: workspace.id,
          root: workspace.root,
          domains: workspace.domains,
          admin: workspace.admin,
          path: directory,
          registered: true,
          coreId: workspace.core_id ?? workspace.id,
          parentCoreId: workspace.id === this.coreId ? this.parentCoreId : null,
          parentCoreIds: workspace.id === this.coreId ? this.parentCoreIds : []
        };
      }
    }
    return match;
  }
  visibilityFor(workspace) {
    const coreIds = [workspace.coreId, ...workspace.parentCoreIds ?? []].filter((id) => id !== null);
    return visibilityFor(workspace.id, workspace.domains, coreIds);
  }
  async preflightForTurn(agent, turn, intent) {
    if (this.hub.config.policy.preflight.mode === "off") return;
    if (intent.trim() === "") return;
    const existing = this.sessions.get(agent.id);
    if (existing !== void 0 && existing.turn === turn && !existing.closed) return;
    await this.beforeNewTask(agent.id, existing);
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    const taskId = this.findLedgerTask(agent.id, turn)?.taskId ?? newTaskId();
    const now = nowIso();
    const record = {
      taskId,
      sessionId: agent.id,
      turn,
      workspaceId: workspace.id,
      intentHash: hashIntent(intent),
      createdAt: now,
      preflight: null,
      assessment: null,
      closedAt: null
    };
    this.tasks.set(taskId, record);
    const state = {
      turn,
      taskId,
      workspace,
      visibility,
      pack: "",
      status: "unavailable",
      hits: [],
      closed: false
    };
    this.sessions.set(agent.id, state);
    try {
      await this.ledger.append({
        type: "task.created",
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        intentHash: record.intentHash,
        idempotencyKey: `${agent.id}:${turn}`
      });
      const preflight = await this.runSearch(intent, workspace, visibility);
      const remote = await this.remoteHybridContributions(intent);
      const { pack, tokens } = this.buildPack(preflight, workspace, this.hub.config.policy.preflight.pack_tokens, remote);
      const status = preflight.length === 0 ? "no_match" : "ready";
      const preflightId = newPreflightId();
      await this.ledger.append({
        type: "preflight.recorded",
        taskId,
        preflightId,
        status,
        hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
        tokens,
        ...remote.length === 0 ? {} : {
          remote: remote.map((entry) => ({
            provider: entry.provider,
            hits: entry.hits,
            ok: entry.ok,
            ...entry.error === void 0 ? {} : { error: entry.error }
          }))
        }
      });
      state.pack = this.hub.config.policy.preflight.inject === "off" ? "" : pack;
      state.status = status;
      state.hits = preflight.map((hit) => ({ id: hit.id, version: hit.version }));
      record.preflight = {
        id: preflightId,
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        status,
        hits: state.hits,
        tokens,
        createdAt: nowIso()
      };
    } catch (error) {
      state.status = "unavailable";
      state.pack = "";
      this.ctx.logger.warn(`dsh-memory-hub: preflight failed for ${agent.id}: ${error.message}`);
      await this.ledger.append({
        type: "preflight.recorded",
        taskId,
        preflightId: newPreflightId(),
        status: "unavailable",
        hits: [],
        tokens: 0,
        error: error.message
      }).catch(() => {
      });
    }
  }
  async manualPreflight(agent, intent, force) {
    const state = this.sessions.get(agent.id);
    if (state === void 0) {
      const text = intent.trim();
      if (text === "") throw new MemoryError("INVALID_INPUT", "intent must not be empty");
      const workspace = await this.resolveWorkspace(agent);
      const visibility = this.visibilityFor(workspace);
      const taskId = newTaskId();
      const nextState = {
        turn: 0,
        taskId,
        workspace,
        visibility,
        pack: "",
        status: "unavailable",
        hits: [],
        closed: false
      };
      this.sessions.set(agent.id, nextState);
      const task2 = {
        taskId,
        sessionId: agent.id,
        turn: 0,
        workspaceId: workspace.id,
        intentHash: hashIntent(text),
        createdAt: nowIso(),
        preflight: null,
        assessment: null,
        closedAt: null
      };
      this.tasks.set(taskId, task2);
      try {
        await this.ledger.append({
          type: "task.created",
          taskId,
          sessionId: agent.id,
          turn: 0,
          workspaceId: workspace.id,
          intentHash: task2.intentHash,
          idempotencyKey: `${agent.id}:manual`
        });
        const hits = await this.runSearch(text, workspace, visibility);
        const remote2 = await this.remoteHybridContributions(text);
        const { pack: pack2, tokens: tokens2 } = this.buildPack(hits, workspace, this.hub.config.policy.preflight.pack_tokens, remote2);
        const status2 = hits.length === 0 ? "no_match" : "ready";
        const preflightId2 = newPreflightId();
        await this.ledger.append({
          type: "preflight.recorded",
          taskId,
          preflightId: preflightId2,
          status: status2,
          hits: hits.map((hit) => ({ id: hit.id, version: hit.version })),
          tokens: tokens2,
          ...remote2.length === 0 ? {} : {
            remote: remote2.map((entry) => ({
              provider: entry.provider,
              hits: entry.hits,
              ok: entry.ok,
              ...entry.error === void 0 ? {} : { error: entry.error }
            }))
          }
        });
        nextState.status = status2;
        nextState.hits = hits.map((hit) => ({ id: hit.id, version: hit.version }));
        nextState.pack = this.hub.config.policy.preflight.inject === "off" ? "" : pack2;
        task2.preflight = {
          id: preflightId2,
          taskId,
          sessionId: agent.id,
          turn: 0,
          workspaceId: workspace.id,
          status: status2,
          hits: nextState.hits,
          tokens: tokens2,
          createdAt: nowIso()
        };
        return { taskId, status: status2, hits: nextState.hits, pack: nextState.pack, tokens: tokens2 };
      } catch (error) {
        this.ctx.logger.warn(`dsh-memory-hub: manual preflight failed: ${error.message}`);
        return { taskId, status: "unavailable", hits: [], pack: "", tokens: 0 };
      }
    }
    if (!force && state.status !== "unavailable") {
      return {
        taskId: state.taskId,
        status: state.status,
        hits: state.hits,
        pack: state.pack,
        tokens: estimateTokens(this.ctx, state.pack)
      };
    }
    const preflight = await this.runSearch(intent, state.workspace, state.visibility);
    const remote = await this.remoteHybridContributions(intent);
    const { pack, tokens } = this.buildPack(preflight, state.workspace, this.hub.config.policy.preflight.pack_tokens, remote);
    const status = preflight.length === 0 ? "no_match" : "ready";
    const preflightId = newPreflightId();
    await this.ledger.append({
      type: "preflight.recorded",
      taskId: state.taskId,
      preflightId,
      status,
      hits: preflight.map((hit) => ({ id: hit.id, version: hit.version })),
      tokens,
      ...remote.length === 0 ? {} : {
        remote: remote.map((entry) => ({
          provider: entry.provider,
          hits: entry.hits,
          ok: entry.ok,
          ...entry.error === void 0 ? {} : { error: entry.error }
        }))
      }
    });
    state.pack = this.hub.config.policy.preflight.inject === "off" ? "" : pack;
    state.status = status;
    state.hits = preflight.map((hit) => ({ id: hit.id, version: hit.version }));
    const task = this.tasks.get(state.taskId);
    if (task !== void 0) {
      task.preflight = {
        id: preflightId,
        taskId: state.taskId,
        sessionId: agent.id,
        turn: task.turn,
        workspaceId: state.workspace.id,
        status,
        hits: state.hits,
        tokens,
        createdAt: nowIso()
      };
    }
    return {
      taskId: state.taskId,
      status,
      hits: state.hits,
      pack: state.pack,
      tokens
    };
  }
  async search(agent, args) {
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    const statuses = new Set(args.statuses ?? ["accepted"]);
    const types = args.types === void 0 ? void 0 : new Set(args.types);
    let scopeFilter = null;
    if (args.scope !== void 0) {
      const scope = parseScope(args.scope);
      if (!isScopeVisible(scope, visibility)) {
        throw new MemoryError("SCOPE_FORBIDDEN", `scope ${args.scope} is not visible from this workspace`);
      }
      scopeFilter = formatScope(scope);
    }
    const limit = Math.max(1, Math.min(20, args.limit ?? 8));
    if (scopeFilter !== null) {
      const ancestorScope = this.parents.find(
        (candidate) => candidate.coreId !== null && `project:${candidate.coreId}` === scopeFilter
      );
      if (ancestorScope !== void 0) {
        const hits3 = this.ancestorLevelSearch(args.query, ancestorScope, { statuses, types, limit, scopeFilter });
        return { hits: hits3, total: hits3.length };
      }
      const raw = this.store.search(args.query, {
        visibility,
        statuses,
        types,
        limit: 20,
        temporal: this.hub.config.policy.temporal
      });
      const hits2 = raw.filter((hit) => formatScope(hit.scope) === scopeFilter).slice(0, limit).map((hit) => ({ ...hit, path: KnowledgeStore.relativePath(this.hub.root, hit.path) }));
      return { hits: hits2, total: hits2.length };
    }
    const hits = this.cascadeSearch(args.query, {
      statuses,
      types,
      limit,
      visibility,
      preferProject: workspace.id ?? void 0
    });
    return {
      hits,
      total: hits.length
    };
  }
  /**
   * 近重复检测（只读）。只在当前可见范围、同类型同作用域之间比较；
   * 不跨 Hub（跨核心的近似标题应走蒸馏而不是合并）。
   */
  async duplicates(agent, args) {
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    let scopeFilter = null;
    if (args.scope !== void 0) {
      const scope = parseScope(args.scope);
      if (!isScopeVisible(scope, visibility)) {
        throw new MemoryError("SCOPE_FORBIDDEN", `scope ${args.scope} is not visible from this workspace`);
      }
      scopeFilter = formatScope(scope);
    }
    const threshold = args.threshold ?? this.hub.config.policy.dedupe.threshold;
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      throw new MemoryError("INVALID_INPUT", "threshold must be within (0, 1]");
    }
    const limit = Math.max(1, Math.min(50, args.limit ?? 10));
    const records = [...this.store.docs.values()].filter((record) => {
      if (record.status !== "accepted") return false;
      if (!isScopeVisible(record.scope, visibility)) return false;
      if (scopeFilter !== null && formatScope(record.scope) !== scopeFilter) return false;
      return true;
    });
    const pairs = findNearDuplicates({ records, threshold, maxPairs: limit });
    return {
      total: pairs.length,
      threshold,
      pairs: pairs.map((pair) => {
        const keeper = this.store.docs.get(pair.keeperId);
        const other = this.store.docs.get(pair.otherId);
        return {
          keeper: { id: keeper.id, version: keeper.version, title: keeper.title, summary: keeper.summary },
          other: { id: other.id, version: other.version, title: other.title, summary: other.summary },
          similarity: pair.similarity,
          titleSimilarity: pair.titleSimilarity,
          highConfidence: pair.highConfidence
        };
      })
    };
  }
  /** 面板只读视图：被合并条目的摘要 + target 旧正文到合并稿的行级 diff。 */
  mergePreview(proposal) {
    const merged = proposal.mergedIds.map((id) => {
      const record = this.store.docs.get(id);
      return record === void 0 ? { id, title: "(not found)", summary: "" } : { id, title: record.title, summary: record.summary };
    });
    const target = proposal.target === null ? void 0 : this.store.docs.get(proposal.target);
    const diff = lineDiff(target?.body ?? "", proposal.body, PANEL_DIFF_LINES);
    return { merged, diff: diff.lines, truncated: diff.truncated };
  }
  /**
   * 回顾式萃取：把本工作区名下已结束会话压成 digest，供模型据此 `memory_propose`。
   * 只读会话与账本/水位；不写任何知识文件，也不调用模型。
   */
  async reflect(agent, args) {
    const workspace = await this.resolveWorkspace(agent);
    const dryRun = args.dry_run === true;
    const mode = args.mode === "search" ? "search" : "digest";
    const workspaceId = workspace.id;
    if (workspaceId === null) {
      throw new MemoryError("INVALID_STATE", "workspace is not registered in config.yaml; add it before reflecting sessions");
    }
    if (this.reflectSource === null || !this.reflectSource.available) {
      return {
        available: false,
        workspaceId,
        mode,
        reason: "sessionQuery service unavailable on this host",
        sessions: [],
        skipped: [],
        dryRun
      };
    }
    const policy = this.hub.config.policy.reflect;
    const reflect = this.reflectConfigFor(workspaceId);
    const lookbackDays = reflect.lookback_days;
    const limit = Math.max(1, Math.min(3, args.limit ?? policy.max_sessions));
    const roots = reflectRoots(this.hub.config);
    const cutoff = Date.now() - lookbackDays * 864e5;
    if (this.reflectState !== null) await this.reflectState.load();
    let records;
    try {
      records = await this.reflectSource.listSessions();
    } catch (error) {
      return {
        available: false,
        workspaceId,
        mode,
        reason: `sessionQuery listSessions failed: ${error.message}`,
        sessions: [],
        skipped: [],
        dryRun
      };
    }
    const owned = records.filter((record) => {
      const header2 = record.header;
      if (header2 === void 0 || typeof header2.id !== "string") return false;
      if (header2.origin === "subagent" || (header2.delegationDepth ?? 0) > 0) return false;
      if (typeof header2.parentSession === "string" && header2.parentSession !== "") return false;
      const owner = ownerWorkspaceOf(header2.cwd, roots);
      if (owner === null || owner.workspaceId !== workspace.id) return false;
      if (typeof header2.createdAt === "number" && header2.createdAt < cutoff) return false;
      return true;
    }).sort((left, right) => (right.header.createdAt ?? 0) - (left.header.createdAt ?? 0));
    const skipped = [];
    if (mode === "search") {
      const query = (args.query ?? "").trim();
      if (query === "") {
        throw new MemoryError("INVALID_INPUT", 'mode "search" requires a non-empty query');
      }
      if (typeof this.reflectSource.searchEvents !== "function") {
        return {
          available: false,
          workspaceId,
          mode,
          reason: "sessionQuery.searchEvents unavailable on this host",
          sessions: [],
          skipped: [],
          dryRun
        };
      }
      const limit2 = Math.max(1, Math.min(50, Math.trunc(args.limit ?? 20)));
      let targets = owned.slice(0, 3);
      if (args.session_id !== void 0 && args.session_id !== "") {
        const requested = owned.find((record) => record.header.id === args.session_id);
        if (requested === void 0) {
          throw new MemoryError(
            "INVALID_INPUT",
            `session ${args.session_id} is not an ended session owned by workspace ${workspace.id}`
          );
        }
        targets = [requested];
      }
      const hits = [];
      for (const record of targets) {
        const sessionId = record.header.id;
        const cwd = typeof record.header.cwd === "string" ? record.header.cwd : "";
        try {
          const page = await this.reflectSource.searchEvents({ sessionId, query, limit: limit2 });
          for (const item of page.items) {
            hits.push({
              sessionId,
              cwd,
              seq: item.seq,
              type: item.type,
              time: typeof item.time === "number" ? new Date(item.time).toISOString() : null,
              surface: typeof item.surface === "string" ? item.surface : null,
              snippet: item.snippet
            });
          }
        } catch (error) {
          skipped.push({ sessionId, reason: `search-failed: ${error.message}` });
        }
      }
      const seen = /* @__PURE__ */ new Set();
      const unique = hits.filter((hit) => {
        const key = `${hit.sessionId}:${hit.seq}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const capped = unique.slice(0, limit2);
      return {
        available: true,
        workspaceId,
        mode,
        sessions: [],
        hits: capped,
        hitsTruncated: unique.length > capped.length,
        skipped,
        dryRun: true
      };
    }
    let selected = owned;
    if (args.session_id !== void 0 && args.session_id !== "") {
      const requested = owned.find((record) => record.header.id === args.session_id);
      if (requested === void 0) {
        throw new MemoryError(
          "INVALID_INPUT",
          `session ${args.session_id} is not an ended session owned by workspace ${workspace.id}`
        );
      }
      selected = [requested];
    }
    selected = selected.slice(0, args.session_id === void 0 ? limit : 1);
    const sessions = [];
    for (const record of selected) {
      const sessionId = record.header.id;
      const prior = this.reflectState?.find(sessionId);
      let snapshot;
      try {
        snapshot = await this.reflectSource.readSession(sessionId);
      } catch (error) {
        skipped.push({ sessionId, reason: `read-failed: ${error.message}` });
        continue;
      }
      const result = buildDigest(snapshot, {
        workspaceId,
        maxChars: policy.max_chars,
        minMessages: policy.min_messages
      });
      if (result.status === "too-short") {
        skipped.push({ sessionId, reason: `too-short (${result.messages} messages)` });
        continue;
      }
      if (result.status === "empty") {
        skipped.push({ sessionId, reason: "empty" });
        continue;
      }
      const digest = result.digest;
      const hash = digestHash(digest);
      if (prior !== void 0 && prior.digestHash === hash) {
        skipped.push({ sessionId, reason: "already-reflected" });
        continue;
      }
      const seqs = snapshot.events.map((event) => event.seq).filter((seq) => typeof seq === "number");
      const seqRange = seqs.length === 0 ? null : { from: Math.min(...seqs), to: Math.max(...seqs) };
      if (!dryRun) {
        await this.reflectState?.mark({
          sessionId,
          workspaceId,
          reflectedAt: nowIso(),
          digestHash: hash,
          proposals: []
        });
        await this.ledger.append({
          type: "reflect.read",
          sessionId,
          workspaceId,
          events: snapshot.events.length,
          chars: digest.chars,
          proposals: 0
        });
      }
      sessions.push({
        sessionId,
        cwd: digest.cwd,
        createdAt: digest.createdAt,
        chars: digest.chars,
        truncated: digest.truncated,
        digest: renderDigest(digest),
        digestHash: hash,
        seqRange
      });
    }
    return { available: true, workspaceId, mode, sessions, skipped, dryRun };
  }
  reflectConfigFor(workspaceId) {
    const core = this.hub.config.core_workspaces.find((entry) => entry.id === workspaceId);
    const workspace = this.activeWorkspaces.find((entry) => entry.id === workspaceId);
    return core?.reflect ?? workspace?.reflect ?? {
      enabled: false,
      time: "04:30",
      target: "new",
      max_candidates: 5,
      lookback_days: 30
    };
  }
  /**
   * 金字塔回退检索：本层（自己的 Hub）有 ≥1 个合格命中即返回、不再上溯；
   * 本层为空才回退到最近的祖先层，依次类推。每层命中都带 core 标注。
   */
  cascadeSearch(query, options) {
    const own = this.store.search(query, {
      visibility: options.visibility,
      statuses: options.statuses,
      ...options.types === void 0 ? {} : { types: options.types },
      limit: Math.max(1, options.limit),
      ...options.minScore === void 0 ? {} : { minScore: options.minScore },
      ...options.preferProject === void 0 ? {} : { preferProject: options.preferProject },
      ...options.localBoost === void 0 ? {} : { localBoost: options.localBoost },
      temporal: this.hub.config.policy.temporal,
      ...options.excludeScheduled === true ? { excludeTemporal: SCHEDULED_STATES } : {}
    });
    if (own.length > 0) return own.slice(0, options.limit);
    for (const parent of this.parents) {
      const levelHits = this.ancestorLevelSearch(query, parent, {
        statuses: options.statuses,
        types: options.types,
        limit: options.limit,
        minScore: options.minScore,
        scopeFilter: null,
        excludeScheduled: options.excludeScheduled
      });
      if (levelHits.length > 0) return levelHits;
    }
    return [];
  }
  /**
   * 在单个祖先核心 Hub 上检索其 project:<祖先核心> 蒸馏条目（只取该层作用域，
   * 避免 global 在跨 Hub 检索里重复）。
   */
  ancestorLevelSearch(query, parent, options) {
    const coreId = parent.coreId;
    if (coreId === null) return [];
    const raw = parent.store.search(query, {
      visibility: { global: false, domains: /* @__PURE__ */ new Set(), projects: /* @__PURE__ */ new Set([coreId]) },
      statuses: options.statuses,
      ...options.types === void 0 ? {} : { types: options.types },
      limit: Math.max(1, options.limit),
      ...options.minScore === void 0 ? {} : { minScore: options.minScore },
      coreTag: coreId,
      temporal: parent.hub.config.policy.temporal,
      ...options.excludeScheduled === true ? { excludeTemporal: SCHEDULED_STATES } : {}
    });
    return raw.filter(
      (hit) => hit.scope.level === "project" && hit.scope.workspaceId === coreId && (options.scopeFilter === null || options.scopeFilter === void 0 || formatScope(hit.scope) === options.scopeFilter)
    ).slice(0, options.limit).map((hit) => ({ ...hit, path: KnowledgeStore.relativePath(parent.hub.root, hit.path) }));
  }
  async get(agent, id, version, core, options = {}) {
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    let resolved;
    if (core !== void 0 && core !== "") {
      const store = this.storeForCore(core);
      if (store === null) {
        throw new MemoryError("NOT_FOUND", `knowledge ${id} does not exist in core ${core}`);
      }
      const record2 = await store.store.get(id, version);
      resolved = record2 === null ? null : { record: record2, core: store.coreId, root: store.hub.root, policy: store.hub.config.policy.temporal };
    } else {
      const own = await this.resolveRecordForRead(id, version);
      resolved = own === null ? null : { ...own, policy: this.hub.config.policy.temporal };
    }
    if (resolved === null) {
      throw new MemoryError("NOT_FOUND", `knowledge ${id}${version === void 0 ? "" : `@${version}`} does not exist`);
    }
    const { record } = resolved;
    if (!isScopeVisible(record.scope, visibility)) {
      throw new MemoryError("SCOPE_FORBIDDEN", `knowledge ${id} is not visible from this workspace`);
    }
    if (record.status === "rejected") {
      throw new MemoryError("NOT_FOUND", `knowledge ${id} was rejected and is not readable through the API`);
    }
    const { body: fullBody, path, extra: _extra, ...metadata } = record;
    void _extra;
    const temporal = temporalState(record, Date.now(), resolved.policy);
    const temporalNote = temporalAnnotation(record, temporal, resolved.policy);
    const headings = bodyHeadings(fullBody);
    const cap = Math.max(200, Math.min(2e4, options.max_chars ?? (options.section === void 0 ? DIGEST_CHARS : SECTION_CHARS)));
    const trimmed = fullBody.trim();
    let body = trimmed;
    let section = null;
    let truncated = false;
    let hint;
    if (options.full !== true) {
      if (options.section !== void 0 && options.section.trim() !== "") {
        const extracted = pickSection(fullBody, options.section);
        if (extracted === null) {
          throw new MemoryError(
            "INVALID_INPUT",
            `section "${options.section}" not found; available: ${headings.join(", ") || "(none)"}`
          );
        }
        body = extracted;
        section = options.section.trim();
      } else {
        body = pickDigest(fullBody, cap);
      }
      if (body.length > cap) {
        body = `${body.slice(0, cap)}\u2026`;
        truncated = true;
      }
      if (body !== trimmed) {
        hint = `abridged; sections: ${headings.join(", ") || "(none)"}; read one with memory_get {id, section:"\u2026"} or the whole body with {id, full:true}`;
      }
    }
    return {
      metadata: {
        ...metadata,
        temporal,
        ...temporalNote === null ? {} : { temporalNote }
      },
      body,
      headings,
      section,
      truncated,
      ...hint === void 0 ? {} : { hint },
      path: KnowledgeStore.relativePath(resolved.root, path),
      core: resolved.core
    };
  }
  /** 在“自己的 Hub → 父核心 Hub”顺序里查找可读条目。 */
  async resolveRecordForRead(id, version) {
    const primary = await this.store.get(id, version);
    if (primary !== null) return { record: primary, core: this.coreId, root: this.hub.root };
    for (const parent of this.parents) {
      const fromParent = await parent.store.get(id, version);
      if (fromParent !== null) return { record: fromParent, core: parent.coreId, root: parent.hub.root };
    }
    return null;
  }
  storeForCore(core) {
    if (this.coreId === core) return { store: this.store, hub: this.hub, coreId: this.coreId };
    for (const parent of this.parents) {
      if (parent.coreId === core) {
        return { store: parent.store, hub: parent.hub, coreId: parent.coreId };
      }
    }
    return null;
  }
  async cite(agent, args) {
    const state = this.sessions.get(agent.id);
    if (state === void 0) throw new MemoryError("NO_TASK", "no open task for this session");
    if (args.task_id !== void 0 && args.task_id !== state.taskId) {
      throw new MemoryError("INVALID_STATE", "can only cite from the current task");
    }
    if (state.closed) throw new MemoryError("INVALID_STATE", "task is already closed");
    const purpose = args.purpose.trim();
    if (purpose.length === 0 || purpose.length > 200) {
      throw new MemoryError("INVALID_INPUT", "purpose must be 1..200 characters");
    }
    let resolved;
    if (args.core !== void 0 && args.core !== "") {
      const store = this.storeForCore(args.core);
      if (store === null) throw new MemoryError("NOT_FOUND", `knowledge ${args.knowledge_id} does not exist in core ${args.core}`);
      const record2 = await store.store.get(args.knowledge_id, args.version);
      resolved = record2 === null ? null : { record: record2, core: store.coreId, root: store.hub.root };
    } else {
      resolved = await this.resolveRecordForRead(args.knowledge_id, args.version);
    }
    if (resolved === null) throw new MemoryError("NOT_FOUND", `knowledge ${args.knowledge_id} does not exist`);
    const { record } = resolved;
    if (record.status !== "accepted") {
      throw new MemoryError("INVALID_STATE", `knowledge ${record.id} is ${record.status}`);
    }
    if (!isScopeVisible(record.scope, state.visibility)) {
      throw new MemoryError("SCOPE_FORBIDDEN", `knowledge ${record.id} is not visible from this workspace`);
    }
    const key = citationKey(state.taskId, record.id, record.version);
    if (this.citationKeys.has(key)) {
      const existing = this.citations.find(
        (citation) => citation.taskId === state.taskId && citation.knowledgeId === record.id && citation.version === record.version
      );
      if (existing !== void 0) return { citationId: existing.id };
    }
    const citationId = newCitationId();
    await this.ledger.append({
      type: "citation.added",
      taskId: state.taskId,
      citationId,
      knowledgeId: record.id,
      version: record.version,
      purpose,
      ...resolved.core === this.coreId ? {} : { coreId: resolved.core }
    });
    this.citationKeys.add(key);
    this.citations.push({
      id: citationId,
      taskId: state.taskId,
      knowledgeId: record.id,
      version: record.version,
      purpose,
      createdAt: nowIso(),
      coreId: resolved.core
    });
    await this.appendAgenda(resolved.root, {
      knowledgeId: record.id,
      version: record.version,
      purpose,
      taskId: state.taskId,
      citationId,
      ...resolved.core === null ? {} : { coreId: resolved.core }
    });
    await this.maybeCitedPush(agent, record, resolved.core);
    return { citationId };
  }
  /* ---------------- 引用即议程 + cited 触发（§5.9.2，M5） ---------------- */
  agendaPath(root) {
    return join9(root, "records", "agenda.jsonl");
  }
  /** 新增引用 → agenda.jsonl 追加一行。agenda 是萃取议程，不是知识；文件可删（账本可重建）。 */
  async appendAgenda(root, entry) {
    try {
      await mkdir3(join9(root, "records"), { recursive: true });
      await appendFile2(this.agendaPath(root), `${JSON.stringify({ ...entry, at: nowIso() })}
`, "utf8");
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-memory-hub: cannot append agenda: ${error.message}`);
    }
  }
  /**
   * 读议程：knowledgeId → 议程行数（≈ 引用次数的信号视图）。
   * 损坏行跳过；这是派生信号，宁缺勿炸。
   */
  async readAgendaCounts(root) {
    const counts = /* @__PURE__ */ new Map();
    let raw;
    try {
      raw = await readFile7(this.agendaPath(root), "utf8");
    } catch {
      return counts;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed.knowledgeId !== "string" || parsed.knowledgeId === "") continue;
        counts.set(parsed.knowledgeId, (counts.get(parsed.knowledgeId) ?? 0) + 1);
      } catch {
        continue;
      }
    }
    return counts;
  }
  /** 本 hub 的引用计数快照（coreId 归属过滤）：knowledgeId → citation.added 次数。 */
  citationCountMap() {
    const counts = /* @__PURE__ */ new Map();
    for (const citation of this.citations) {
      if ((citation.coreId ?? null) !== (this.coreId ?? null)) continue;
      counts.set(citation.knowledgeId, (counts.get(citation.knowledgeId) ?? 0) + 1);
    }
    return counts;
  }
  /**
   * trigger: 'cited' 的触发器：本次 cite 让条目**恰好达到**某 provider 的
   * `require_citations` 门槛时，对该 provider 触发一次 push（门槛 = 0 不触发；
   * 推送是全量扫掠但引用门槛会挡住没人用的条目）。失败降级为诊断，绝不抛进 cite。
   */
  async maybeCitedPush(agent, record, coreId) {
    if (coreId !== (this.coreId ?? null)) return;
    const remote = this.hub.config.remote;
    if (remote === void 0 || remote.enabled !== true) return;
    const handles = this.resolveRemoteHandles(void 0, ["mirror"]);
    if (handles.length === 0) return;
    const counts = this.citationCountMap();
    const total = counts.get(record.id) ?? 0;
    for (const handle of handles) {
      const mirror = handle.settings.mirror;
      if (mirror.trigger !== "cited" || mirror.require_citations < 1) continue;
      if (total !== mirror.require_citations) continue;
      if (handle.adapter === null) continue;
      try {
        const engine = this.buildEngine(agent, handle);
        const result = await engine.push();
        this.ctx.logger?.info(
          `dsh-memory-hub: cited-trigger push for ${handle.settings.id}: pushed=${result.pushed} gated=${result.gated ?? 0}`
        );
      } catch (error) {
        this.ctx.logger?.warn(
          `dsh-memory-hub: cited-trigger push failed for ${handle.settings.id}: ${error.message}`
        );
      }
    }
  }
  async propose(agent, args) {
    const state = this.sessions.get(agent.id);
    if (state === void 0) throw new MemoryError("NO_TASK", "no open task for this session");
    if (state.closed) throw new MemoryError("INVALID_STATE", "task is already closed");
    const coreId = state.workspace.coreId;
    const rawScope = args.scope === "core" ? coreId === null ? null : `project:${coreId}` : args.scope === "parent" ? this.parentCoreId === null ? null : `project:${this.parentCoreId}` : args.scope;
    if (rawScope === null) {
      throw new MemoryError(
        "INVALID_INPUT",
        args.scope === "parent" ? 'scope "parent" is only available inside a dual-role workspace with an open parent core' : 'scope "core" is only available inside a configured core workspace'
      );
    }
    const scope = parseScope(rawScope);
    if (!isScopeVisible(scope, state.visibility)) {
      throw new MemoryError("SCOPE_FORBIDDEN", `scope ${rawScope} is not visible from this workspace`);
    }
    let target = null;
    if (scope.level === "project") {
      target = this.parents.find((parent) => parent.coreId === scope.workspaceId) ?? null;
    }
    const owningStore = target === null ? this.store : target.store;
    const owningHub = target === null ? this.hub : target.hub;
    const owningCoreId = target === null ? this.coreId : target.coreId;
    const formattedScope = formatScope(scope);
    const pending = [
      ...this.store.pendingForTask(state.taskId),
      ...target === null ? [] : target.store.pendingForTask(state.taskId)
    ];
    if (pending.length >= this.hub.config.policy.limits.max_pending_per_task) {
      throw new MemoryError("INVALID_STATE", `task already has ${pending.length} pending proposals`);
    }
    const risk = assessProposalRisk({
      title: args.title,
      summary: args.summary,
      ...args.content === void 0 ? {} : { content: args.content },
      ...args.source_refs === void 0 ? {} : { sourceRefs: args.source_refs }
    });
    const duplicate = pending.find(
      (proposal2) => proposal2.operation === args.operation && proposal2.type === args.type && formatScope(proposal2.scope) === formattedScope && proposal2.title === args.title.trim() && proposal2.target === (args.target ?? null)
    );
    if (duplicate !== void 0) {
      return {
        proposalId: duplicate.id,
        pendingPath: KnowledgeStore.relativePath(owningHub.root, duplicate.path),
        core: owningCoreId,
        scope: formattedScope,
        risk
      };
    }
    const proposal = await owningStore.propose(
      {
        operation: args.operation,
        type: args.type,
        scope: rawScope,
        title: args.title,
        summary: args.summary,
        ...args.content === void 0 ? {} : { content: args.content },
        ...args.source_refs === void 0 ? {} : { sourceRefs: args.source_refs },
        ...args.tags === void 0 ? {} : { tags: args.tags },
        ...args.related === void 0 ? {} : { related: args.related },
        ...args.supersedes === void 0 ? {} : { supersedes: args.supersedes },
        ...args.applies_to === void 0 ? {} : { appliesTo: args.applies_to },
        ...args.target === void 0 ? {} : { target: args.target },
        ...args.expected_version === void 0 ? {} : { expectedVersion: args.expected_version },
        ...args.reason === void 0 ? {} : { reason: args.reason },
        ...args.valid_from === void 0 ? {} : { validFrom: args.valid_from },
        ...args.expires_at === void 0 ? {} : { expiresAt: args.expires_at },
        ...args.last_verified === void 0 ? {} : { lastVerified: args.last_verified },
        ...args.merged_ids === void 0 ? {} : { mergedIds: args.merged_ids }
      },
      { taskId: state.taskId }
    );
    await (target === null ? this.ledger : target.ledger).append({
      type: "proposal.created",
      taskId: state.taskId,
      proposalId: proposal.id,
      ...risk.level === "none" ? {} : { riskLevel: risk.level, riskSignals: risk.signals.map((signal) => signal.code) }
    });
    return {
      proposalId: proposal.id,
      pendingPath: KnowledgeStore.relativePath(owningHub.root, proposal.path),
      core: owningCoreId,
      scope: formattedScope,
      risk
    };
  }
  async commit(agent, proposalId, core) {
    let proposal;
    let owning;
    if (core !== void 0 && core !== "") {
      const target = this.storeForCore(core);
      if (target === null) throw new MemoryError("NOT_FOUND", `core ${core} is not reachable from this workspace`);
      proposal = target.store.getProposal(proposalId);
      owning = target.store;
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId);
      owning = this.owningStoreFor(proposalId) ?? this.store;
    }
    if (proposal === null) throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    if (!isScopeVisible(proposal.scope, visibility) && !workspace.admin) {
      throw new MemoryError("SCOPE_FORBIDDEN", `proposal ${proposalId} targets a scope not visible from this workspace`);
    }
    const precheck = this.precheckCommitOn(owning, proposal);
    if (!precheck.ok) throw new MemoryError(precheck.code, precheck.reason);
    const result = await owning.commit(
      proposalId,
      this.approvalMode() === "auto" ? "test:auto" : "dsh:approval"
    );
    return {
      knowledgeId: result.record.id,
      version: result.record.version,
      status: result.record.status,
      superseded: result.superseded
    };
  }
  /** 面板人工审核：批准候选。账本 approvalRef 记为 panel:human，面板请求本身即人工点击。 */
  async approveProposal(proposalId) {
    const owning = this.owningStoreFor(proposalId);
    if (owning === null) throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    const proposal = owning.getProposal(proposalId);
    if (proposal === null) throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    const precheck = this.precheckCommitOn(owning, proposal);
    if (!precheck.ok) throw new MemoryError(precheck.code, precheck.reason);
    const result = await owning.commit(proposalId, "panel:human");
    return {
      knowledgeId: result.record.id,
      version: result.record.version,
      status: result.record.status,
      superseded: result.superseded
    };
  }
  /** 面板人工审核：拒绝候选。 */
  async rejectProposal(proposalId, reason) {
    const owning = this.owningStoreFor(proposalId);
    if (owning === null) throw new MemoryError("NOT_FOUND", `proposal ${proposalId} does not exist`);
    return owning.reject(proposalId, reason);
  }
  /** 在“自己的 Hub → 父核心 Hub”顺序里查找 proposal（跨 Hub 分级蒸馏）。 */
  resolveProposalAcrossStores(proposalId) {
    const own = this.store.getProposal(proposalId);
    if (own !== null) return own;
    for (const parent of this.parents) {
      const found = parent.store.getProposal(proposalId);
      if (found !== null) return found;
    }
    return null;
  }
  owningStoreFor(proposalId) {
    if (this.store.getProposal(proposalId) !== null) return this.store;
    for (const parent of this.parents) {
      if (parent.store.getProposal(proposalId) !== null) return parent.store;
    }
    return null;
  }
  precheckCommit(proposal) {
    return this.precheckCommitOn(this.owningStoreFor(proposal.id) ?? this.store, proposal);
  }
  precheckCommitOn(store, proposal) {
    if (proposal.status !== "pending") {
      return { ok: false, code: "INVALID_STATE", reason: `proposal ${proposal.id} is ${proposal.status}` };
    }
    if (proposal.operation !== "deprecate" && proposal.sourceRefs.length === 0) {
      const required = this.hub.config.policy.evidence.required_for;
      if (required.includes(proposal.type)) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          reason: `proposal ${proposal.id} needs at least one source_ref for type ${proposal.type}`
        };
      }
    }
    if (proposal.operation !== "create") {
      if (proposal.target === null || proposal.expectedVersion === null) {
        return { ok: false, code: "INVALID_INPUT", reason: `${proposal.operation} requires target and expected_version` };
      }
      const target = store.docs.get(proposal.target);
      if (target === void 0) {
        return { ok: false, code: "NOT_FOUND", reason: `target ${proposal.target} does not exist` };
      }
      if (target.status !== "accepted") {
        return { ok: false, code: "INVALID_STATE", reason: `target ${proposal.target} is ${target.status}` };
      }
      if (target.version !== proposal.expectedVersion) {
        return {
          ok: false,
          code: "VERSION_CONFLICT",
          reason: `target ${proposal.target} is at version ${target.version}, expected ${proposal.expectedVersion}`
        };
      }
      if (formatScope(target.scope) !== formatScope(proposal.scope)) {
        return { ok: false, code: "SCOPE_FORBIDDEN", reason: "target scope does not match proposal scope" };
      }
    }
    for (const oldId of proposal.supersedes) {
      const old = store.docs.get(oldId);
      if (old === void 0 || old.status !== "accepted") {
        return { ok: false, code: "INVALID_STATE", reason: `supersedes target ${oldId} is not accepted` };
      }
    }
    return { ok: true };
  }
  precheckProposal(proposalId, core) {
    let proposal;
    if (core !== void 0 && core !== "") {
      proposal = this.storeForCore(core)?.store.getProposal(proposalId) ?? null;
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId);
    }
    if (proposal === null) {
      return { ok: false, code: "NOT_FOUND", reason: `proposal ${proposalId} does not exist` };
    }
    return this.precheckCommit(proposal);
  }
  describeCommit(proposalId, core) {
    let proposal;
    if (core !== void 0 && core !== "") {
      proposal = this.storeForCore(core)?.store.getProposal(proposalId) ?? null;
    } else {
      proposal = this.resolveProposalAcrossStores(proposalId);
    }
    if (proposal === null) {
      return {
        reason: `Commit memory proposal ${proposalId}`,
        displayReason: {
          en: `Commit memory proposal ${proposalId}`,
          zh: `\u63D0\u4EA4\u8BB0\u5FC6\u63D0\u6848 ${proposalId}`
        }
      };
    }
    const reason = `Commit ${proposal.id}: ${proposal.title} \u2192 ${formatScope(proposal.scope)} (${proposal.operation})`;
    return {
      reason,
      displayReason: {
        en: reason,
        zh: `\u63D0\u4EA4 ${proposal.id}\u300C${proposal.title}\u300D\u2192 ${formatScope(proposal.scope)}`
      }
    };
  }
  async closeTask(agent, assessment, taskId) {
    const state = this.sessions.get(agent.id);
    if (state === void 0) throw new MemoryError("NO_TASK", "no open task for this session");
    if (taskId !== void 0 && taskId !== state.taskId) {
      throw new MemoryError("INVALID_STATE", "can only close the current task");
    }
    const task = this.tasks.get(state.taskId);
    if (task !== void 0 && task.assessment !== null) {
      state.closed = true;
      return { closed: true, assessment: task.assessment };
    }
    this.validateAssessment(state.taskId, assessment);
    await this.ledger.append({ type: "task.closed", taskId: state.taskId, assessment });
    if (task !== void 0) {
      task.assessment = assessment;
      task.closedAt = nowIso();
    }
    state.closed = true;
    return { closed: true, assessment };
  }
  async closeDeferred(sessionId, turn) {
    const state = this.sessions.get(sessionId);
    if (state === void 0 || state.closed) return;
    if (turn !== void 0 && state.turn !== turn) return;
    try {
      await this.ledger.append({
        type: "task.closed",
        taskId: state.taskId,
        assessment: { kind: "deferred", reason: "turn ended without an assessment" }
      });
      const task = this.tasks.get(state.taskId);
      if (task !== void 0) {
        task.assessment = { kind: "deferred", reason: "turn ended without an assessment" };
        task.closedAt = nowIso();
      }
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot record deferred close: ${error.message}`);
    } finally {
      state.closed = true;
      state.pack = "";
    }
  }
  /** 腾讯桥是否启用：配置 enabled 且 hub 存在。 */
  get tencentEnabled() {
    return this.hub.config.tencent.enabled;
  }
  ensureTencentBridge(agent) {
    if (!this.tencentEnabled) {
      throw new MemoryError("NOT_CONFIGURED", "tencent bridge is disabled; set policy tencent.enabled in config.yaml");
    }
    if (this.tencentBridge === null) {
      const t = this.hub.config.tencent;
      const apiKey = resolveApiKeyEnv(t.api_key_env) ?? "";
      if (apiKey === "") {
        throw new MemoryError(
          "NOT_CONFIGURED",
          `tencent api key env ${t.api_key_env} is empty (checked process.env and $DSH_HOME/.credentials.yaml refs); cannot enable bridge`
        );
      }
      const client = new TencentClient({
        config: {
          url: t.url,
          apiKey,
          serviceId: t.service_id,
          teamId: t.team_id,
          agentId: t.agent_id,
          userId: t.user_id,
          taskId: t.task_id,
          timeoutMs: t.timeout_ms
        }
      });
      const recordsDir = join9(this.hub.root, "records");
      this.tencentBridge = new TencentSync({
        recordsDir,
        pullLimit: t.pull_limit,
        pullScope: t.pull_scope,
        pullType: t.pull_type,
        pushSessionPrefix: "dsh-memory-hub",
        host: {
          proposeCandidate: async (input) => {
            const result = await this.propose(agent, {
              operation: "create",
              type: input.type,
              scope: input.scope,
              title: input.title,
              summary: input.summary,
              ...input.content === void 0 ? {} : { content: input.content },
              ...input.sourceRefs === void 0 ? {} : { source_refs: input.sourceRefs },
              ...input.tags === void 0 ? {} : { tags: input.tags }
            });
            return { proposalId: result.proposalId };
          },
          listAcceptedKnowledge: async () => {
            return [...this.store.docs.values()].filter((record) => record.status === "accepted");
          },
          audit: async (event) => {
            if (event.type === "tencent.pull") {
              await this.ledger.append({
                type: "tencent.pull",
                pulled: event.payload?.pulled ?? 0,
                proposed: event.payload?.proposed ?? 0,
                skipped: event.payload?.skipped ?? 0
              });
            } else if (event.type === "tencent.push") {
              await this.ledger.append({
                type: "tencent.push",
                id: event.payload?.id ?? "?",
                fromOutbox: event.payload?.fromOutbox === true
              });
            }
          }
        },
        client
      });
    }
    return this.tencentBridge;
  }
  /**
   * 归一化后的远端设置（含 legacy `tencent:` 段的 desugar）。
   *
   * 每次调用都从 `hub.config` 重新算，不缓存：`updateConfig` → `reloadConfig` 之后
   * 必须立刻看到新角色，否则面板改完配置要重启才生效。
   */
  remoteSettings() {
    const config = this.hub.config;
    return normalizeRemoteSettings({
      remote: config.remote,
      tencent: this.hub.config.tencent
    });
  }
  /** 远端总开关：`remote.enabled`（旧配置由 desugar 从 `tencent.enabled` 派生）。 */
  get remoteEnabled() {
    return this.remoteSettings().enabled;
  }
  /**
   * 构造 provider 注册表。
   *
   * 与 `ensureTencentBridge` 的区别是**不抛错**：单个 provider 缺密钥只是该 provider
   * 不可用，其余 provider 照常工作。这是"降级不允许静默"的另一面——不静默，
   * 但也不让一个坏 provider 拖垮全部远端能力。
   */
  ensureRemoteRegistry() {
    if (this.remoteRegistry === null) {
      this.remoteRegistry = new RemoteRegistry(this.remoteSettings(), {
        resolveSecret: (envName) => resolveApiKeyEnv(envName) ?? ""
      });
    }
    return this.remoteRegistry;
  }
  /** 配置变更后丢弃已构造的 adapter（下一次访问重新构造）。 */
  resetRemoteRegistry() {
    const previous = this.remoteRegistry;
    this.remoteRegistry = null;
    if (previous !== null) {
      void previous.close().catch(() => {
      });
    }
  }
  /**
   * 远端诊断（只读、不联网）。
   *
   * 未启用时仍返回结构（`enabled: false`），让 `memory_status` 与面板能区分
   * "没配" / "配了但 adapter 构造失败" / "构造成功但未探活"三种情况。
   * 每 provider 附同步快照（outbox/孤儿/镜像计数 + 待传播数）——overview 与
   * config 都是同步路径，快照用 readFileSync 读小文件（面板 30s 轮询一次）。
   */
  remoteStatus() {
    const settings = this.remoteSettings();
    const validation = validateRemoteSettings(settings);
    const emptyRoles = { feed: [], mirror: [], authority: [], index: [] };
    if (!settings.enabled) {
      return { enabled: false, mode: settings.mode, providers: [], roles: emptyRoles, validation };
    }
    const registry = this.ensureRemoteRegistry();
    const records = this.store.records();
    const recordsDir = join9(this.hub.root, "records");
    const providers = registry.list().map((handle) => {
      const snapshot = readRemoteSyncStateSync(recordsDir, handle.settings.id);
      const pendingForget = countPendingForget(records, handle.settings.forget, snapshot.pushedIds, snapshot.forgottenIds);
      return {
        id: handle.settings.id,
        kind: handle.settings.kind,
        enabled: handle.settings.enabled,
        roles: [...handle.settings.roles],
        ready: handle.adapter !== null,
        error: handle.error,
        capabilities: handle.adapter === null ? [] : [...handle.adapter.capabilities()].sort((a, b) => a.localeCompare(b)),
        projection: {
          scopes: [...handle.settings.projection.scopes],
          types: [...handle.settings.projection.types],
          exclude_tags: [...handle.settings.projection.exclude_tags]
        },
        feed: { ...handle.settings.feed, tags: [...handle.settings.feed.tags] },
        mirror: { ...handle.settings.mirror },
        config: { ...handle.settings.config },
        forget: {
          on_deprecate: handle.settings.forget.on_deprecate,
          on_merge: handle.settings.forget.on_merge,
          max_per_run: handle.settings.forget.max_per_run
        },
        sync: {
          mirrored: snapshot.mirrored,
          outboxPending: snapshot.outboxPending,
          orphans: snapshot.orphans,
          pendingForget,
          lastPullAt: snapshot.lastPullAt,
          lastPushAt: snapshot.lastPushAt,
          lastForgetAt: snapshot.lastForgetAt,
          lastError: snapshot.lastError
        }
      };
    });
    return {
      enabled: true,
      mode: settings.mode,
      providers,
      roles: registry.roleSummary(),
      validation
    };
  }
  /**
   * 探测全部 provider（**会联网**，只读）。
   *
   * 失败不抛：每个 provider 单独 try，结果汇总。供 `memory_remote_status` 主动体检用。
   */
  async remoteProbe() {
    const settings = this.remoteSettings();
    const validation = validateRemoteSettings(settings);
    if (!settings.enabled) {
      return { enabled: false, validation, providers: [] };
    }
    const registry = this.ensureRemoteRegistry();
    const providers = [];
    for (const handle of registry.list()) {
      if (handle.adapter === null) {
        providers.push({ id: handle.settings.id, ok: false, detail: handle.error ?? "adapter unavailable" });
        continue;
      }
      const probe = await handle.adapter.probe();
      providers.push({
        id: handle.settings.id,
        ok: probe.ok,
        ...probe.latencyMs === void 0 ? {} : { latencyMs: probe.latencyMs },
        ...probe.detail === void 0 ? {} : { detail: probe.detail }
      });
    }
    return { enabled: true, validation, providers };
  }
  /** 同步引擎的宿主适配：候选生成、知识清单与审计都走 service 既有路径。 */
  remoteSyncHost(agent) {
    return {
      proposeCandidate: async (input) => {
        const result = await this.propose(agent, {
          operation: "create",
          type: input.type,
          scope: input.scope,
          // 远端原文不保证符合本地长度约束（真机验证：L1 atomic summary 可超 240，
          // 直接透传会被拒并永久重试）。在边界截断，让候选总能提出去，人审时看全文。
          title: truncate5(input.title, 200),
          summary: truncate5(input.summary, 240),
          ...input.content === void 0 ? {} : { content: input.content },
          source_refs: input.sourceRefs,
          ...input.tags === void 0 ? {} : { tags: input.tags }
        });
        return { proposalId: result.proposalId };
      },
      allKnowledge: async () => this.store.records(),
      audit: async (event) => {
        if (event.type === "remote.pull") {
          await this.ledger.append({ type: "remote.pull", ...event.payload });
        } else if (event.type === "remote.push") {
          await this.ledger.append({ type: "remote.push", ...event.payload });
        } else {
          await this.ledger.append({ type: "remote.forget", ...event.payload });
        }
      }
    };
  }
  /**
   * 解析要操作的 provider 句柄。
   *
   * 指定 `provider` 时即使 adapter 不可用也返回该句柄（让结果里出现明确的错误，
   * 而不是"什么都不发生"）；不指定时只返回承担所需角色且已启用的 provider。
   */
  resolveRemoteHandles(provider, roles) {
    const settings = this.remoteSettings();
    if (!settings.enabled) {
      throw new MemoryError("NOT_CONFIGURED", "remote providers are disabled; set remote.enabled in config.yaml");
    }
    const registry = this.ensureRemoteRegistry();
    if (provider !== void 0) {
      const handle = registry.get(provider);
      if (handle === null) {
        const known = registry.list().map((item) => item.settings.id).join(", ") || "(none configured)";
        throw new MemoryError("NOT_FOUND", `unknown remote provider "${provider}" (configured: ${known})`);
      }
      return [handle];
    }
    return registry.list().filter(
      (handle) => handle.settings.enabled && handle.settings.roles.some((role) => roles.includes(role))
    );
  }
  buildEngine(agent, handle) {
    if (handle.adapter === null) {
      throw new MemoryError(
        "NOT_CONFIGURED",
        `provider "${handle.settings.id}" is unavailable: ${handle.error ?? "adapter unavailable"}`
      );
    }
    const workspace = this.sessions.get(agent.id)?.workspace ?? this.matchWorkspaceSync(agent);
    const workspaceId = workspace.registered && workspace.id !== null ? workspace.id : null;
    return new RemoteSync({
      providerId: handle.settings.id,
      recordsDir: join9(this.hub.root, "records"),
      host: this.remoteSyncHost(agent),
      adapter: handle.adapter,
      settings: handle.settings,
      origin: {
        coreId: this.coreId,
        workspaceId,
        hubKey: workspaceId ?? this.coreId ?? "local"
      },
      // 引用门槛（§5.9.2）：本 hub 的 citation.added 计数快照；require_citations: 0 时引擎不会查询。
      citationCount: (() => {
        const counts = this.citationCountMap();
        return (knowledgeId) => counts.get(knowledgeId) ?? 0;
      })()
    });
  }
  /**
   * 一次性迁移旧腾讯桥的状态游标（幂等；详见 sync.ts migrateLegacyRemoteState）。
   * 成功才记 `remote.migrated` 账本事件；未迁移（无旧文件/已存在/解析失败）静默——
   * 失败细节留在返回值里，由调用方自行决定是否升告警。
   */
  async migrateLegacyRemoteState(providerId) {
    const result = await migrateLegacyRemoteState(join9(this.hub.root, "records"), providerId);
    if (result.migrated) {
      await this.ledger.append({
        type: "remote.migrated",
        provider: providerId,
        pulled: result.pulled,
        pushed: result.pushed,
        source: "legacy"
      });
      this.ctx.logger.info(
        `dsh-memory-hub: migrated legacy remote state for ${providerId} (pulled=${result.pulled}, pushed=${result.pushed})`
      );
    }
    return result;
  }
  /**
   * 手动触发远端同步。方向默认 `pull` + `push`；**forget 不在默认方向里**——
   * 删除传播必须走显式的 `memory_remote_forget`，避免一次随手 sync 把作扩散到远端。
   */
  async remoteSync(agent, opts = {}) {
    await this.ensureTask(agent, "remote provider sync");
    const directions = opts.direction !== void 0 ? [opts.direction] : ["pull", "push"];
    const roles = directions.includes("pull") && directions.includes("push") ? ["feed", "mirror"] : directions.includes("pull") ? ["feed"] : ["mirror"];
    const handles = this.resolveRemoteHandles(opts.provider, roles);
    const results = [];
    for (const handle of handles) {
      if (handle.adapter === null) {
        results.push({ provider: handle.settings.id, ok: false, error: handle.error ?? "adapter unavailable" });
        continue;
      }
      await this.migrateLegacyRemoteState(handle.settings.id);
      try {
        const engine = this.buildEngine(agent, handle);
        const entry = {
          provider: handle.settings.id,
          ok: true,
          error: null
        };
        if (directions.includes("pull")) entry.pull = await engine.pull();
        if (directions.includes("push")) entry.push = await engine.push();
        results.push(entry);
      } catch (error) {
        results.push({ provider: handle.settings.id, ok: false, error: error.message });
      }
    }
    return { results };
  }
  /**
   * 作废传播 / 人工显式遗忘。
   *
   * - 无 `knowledgeId`：传播模式，受 provider 的 `forget.on_deprecate` / `on_merge` /
   *   `max_per_run` 控制；`dryRun: true` 预览且零副作用。
   * - 有 `knowledgeId`：绕过开关，但从未镜像过的条目会如实报 skipped（不产生幽灵请求）。
   */
  async remoteForget(agent, opts = {}) {
    await this.ensureTask(agent, "remote provider forget");
    const handles = this.resolveRemoteHandles(opts.provider, ["mirror"]);
    const results = [];
    for (const handle of handles) {
      if (handle.adapter === null) {
        results.push({ provider: handle.settings.id, ok: false, error: handle.error ?? "adapter unavailable" });
        continue;
      }
      await this.migrateLegacyRemoteState(handle.settings.id);
      try {
        const engine = this.buildEngine(agent, handle);
        const result = await engine.forget({
          ...opts.dryRun === void 0 ? {} : { dryRun: opts.dryRun },
          ...opts.reason === void 0 ? {} : { reason: opts.reason },
          ...opts.knowledgeId === void 0 ? {} : { knowledgeId: opts.knowledgeId }
        });
        results.push({ provider: handle.settings.id, ok: true, error: null, result });
      } catch (error) {
        results.push({ provider: handle.settings.id, ok: false, error: error.message });
      }
    }
    return { results };
  }
  /** 远端诊断 + 各 provider 的同步快照（只读文件，不联网）。 */
  async remoteStatusDetailed() {
    const base = this.remoteStatus();
    if (!base.enabled) return { ...base, sync: [] };
    const recordsDir = join9(this.hub.root, "records");
    const sync = [];
    for (const provider of this.remoteSettings().providers) {
      sync.push(await readRemoteSyncSnapshot(recordsDir, provider.id));
    }
    return { ...base, sync };
  }
  /** 腾讯桥状态（只读）。未启用时返回 disabled 标记。 */
  async tencentStatus(agent) {
    if (!this.tencentEnabled) return { enabled: false };
    const bridge = this.ensureTencentBridge(agent);
    const status = await bridge.status();
    try {
      const { total } = await bridge.client.ping();
      return { ...status, ping: { ok: true, total } };
    } catch (error) {
      return { ...status, ping: { ok: false, error: error.message } };
    }
  }
  /** 拉取腾讯 L1/L2 → 生成本地 pending 候选。不 commit。 */
  async tencentPull(agent) {
    if (!this.tencentEnabled) {
      throw new MemoryError("NOT_CONFIGURED", "tencent bridge is disabled; set tencent.enabled in config.yaml");
    }
    await this.ensureTask(agent, "tencent bridge sync pull");
    const bridge = this.ensureTencentBridge(agent);
    return bridge.pull();
  }
  /** 确保有一个未关闭的会话任务可供 propose 使用（同步/后台操作专用）。 */
  /**
   * 确保该会话有一个打开的任务（无则新开一个）。
   * DSH glue 由预检钩子开任务；headless 入口（MCP / CLI / serve）没有轮前钩子，
   * 在写路径（cite / closeTask / commit）前调用本方法补齐任务语义。
   */
  async ensureTask(agent, intent) {
    const existing = this.sessions.get(agent.id);
    if (existing !== void 0 && !existing.closed) return;
    await this.beforeNewTask(agent.id, existing);
    const workspace = await this.resolveWorkspace(agent);
    const visibility = this.visibilityFor(workspace);
    const taskId = newTaskId();
    const turn = existing?.turn ?? 0;
    const now = nowIso();
    const record = {
      taskId,
      sessionId: agent.id,
      turn,
      workspaceId: workspace.id,
      intentHash: hashIntent(intent),
      createdAt: now,
      preflight: null,
      assessment: null,
      closedAt: null
    };
    this.tasks.set(taskId, record);
    this.sessions.set(agent.id, {
      turn,
      taskId,
      workspace,
      visibility,
      pack: "",
      status: "unavailable",
      hits: [],
      closed: false
    });
    try {
      await this.ledger.append({
        type: "task.created",
        taskId,
        sessionId: agent.id,
        turn,
        workspaceId: workspace.id,
        intentHash: record.intentHash,
        idempotencyKey: `${agent.id}:tencent-pull`
      });
    } catch (error) {
      this.ctx.logger.warn(`dsh-memory-hub: cannot record sync task: ${error.message}`);
    }
  }
  /** 把本地 accepted 知识 push 到腾讯通道。 */
  async tencentPush(agent) {
    if (!this.tencentEnabled) {
      throw new MemoryError("NOT_CONFIGURED", "tencent bridge is disabled; set tencent.enabled in config.yaml");
    }
    return this.ensureTencentBridge(agent).push();
  }
  /** 场景归纳是否启用（layers.scenario_dir 非空）。 */
  get scenarioEnabled() {
    return this.hub.config.layers.scenario_dir.trim() !== "";
  }
  /** 重建场景索引（只写 scenario 目录，不碰 knowledge/）。 */
  async scenarioRebuild(_agent) {
    if (!this.scenarioEnabled) {
      return { scenarios: [], skipped: 0 };
    }
    const builder = new ScenarioBuilder({
      scenarioDir: this.hub.config.layers.scenario_dir
    });
    const records = [...this.store.docs.values()];
    return builder.rebuild(this.hub.root, records);
  }
  /** 只读列出场景文件。 */
  async scenarioList(_agent) {
    if (!this.scenarioEnabled) return [];
    const builder = new ScenarioBuilder({ scenarioDir: this.hub.config.layers.scenario_dir });
    return builder.list(this.hub.root);
  }
  async consolidate(agent, args) {
    const workspace = await this.resolveWorkspace(agent);
    if (!workspace.admin) {
      throw new MemoryError("SCOPE_FORBIDDEN", "consolidation requires an admin workspace");
    }
    const workspaceIds = args.workspace_ids ?? this.activeWorkspaces.filter((entry) => entry.enabled).map((entry) => entry.id);
    for (const id of workspaceIds) {
      if (!this.activeWorkspaces.some((entry) => entry.id === id && entry.enabled)) {
        throw new MemoryError("INVALID_INPUT", `unknown workspace ${id}`);
      }
    }
    const result = await this.store.consolidate({
      targetScope: this.hub.config.consolidation.target_scope,
      workspaceIds,
      ...args.types === void 0 ? {} : { types: args.types },
      dryRun: args.dry_run === true
    });
    if (args.dry_run !== true) {
      for (const proposal of result.created) {
        await this.ledger.append({
          type: "proposal.created",
          taskId: proposal.taskId,
          proposalId: proposal.id
        });
      }
      await this.ledger.append({
        type: "consolidation.run",
        actorWorkspace: workspace.id,
        workspaceIds,
        created: result.created.length,
        skipped: result.skipped
      });
    }
    return { ...result, dryRun: args.dry_run === true };
  }
  async maintenance(args) {
    if (args.admin !== true) {
      throw new MemoryError("SCOPE_FORBIDDEN", "maintenance requires an admin workspace");
    }
    const apply = args.apply === "propose" ? "propose" : "report";
    const maxProposals = Math.min(20, Math.max(1, Math.trunc(args.maxProposals ?? 10)));
    const stalePendingDays = Math.min(3650, Math.max(1, Math.trunc(args.stalePendingDays ?? 30)));
    const staleCitationDays = Math.min(3650, Math.max(1, Math.trunc(args.staleCitationDays ?? 90)));
    const analysis = analyzeMaintenance(this.store, {
      coreId: args.coreId,
      workspaces: this.activeWorkspaces.map((workspace) => ({
        id: workspace.id,
        root: workspace.root,
        coreId: workspace.core_id ?? null,
        admin: workspace.admin,
        enabled: workspace.enabled
      })),
      citations: this.citationIndex(),
      agenda: await this.readAgendaCounts(this.hub.root),
      stalePendingDays,
      staleCitationDays,
      ...args.now === void 0 ? {} : { now: args.now },
      maxBodyBytes: this.hub.config.policy.limits.max_body_bytes,
      temporal: this.hub.config.policy.temporal
    });
    const taskId = newMaintenanceTaskId();
    const created = [];
    const errors = [];
    let skipped = 0;
    let truncated = 0;
    if (apply === "propose" && !await this.hub.ensureWritable()) {
      errors.push(`hub is read-only: ${this.hub.readOnlyReason ?? "unknown reason"}`);
    } else if (apply === "propose") {
      const pendingTags = /* @__PURE__ */ new Set();
      for (const proposal of this.store.proposals.values()) {
        if (proposal.status !== "pending") continue;
        for (const tag of proposal.tags) if (tag.startsWith("maint-")) pendingTags.add(tag);
      }
      for (const candidate of analysis.candidates) {
        if (this.maintenanceAlreadyPending(candidate, pendingTags)) {
          skipped += 1;
          continue;
        }
        if (created.length >= maxProposals) {
          truncated += 1;
          continue;
        }
        try {
          const proposal = await this.store.propose(candidate.input, { taskId });
          await this.ledger.append({
            type: "proposal.created",
            taskId,
            proposalId: proposal.id
          });
          created.push(proposal);
          pendingTags.add(maintenanceToken(candidate.fingerprint));
        } catch (error) {
          errors.push(`${candidate.fingerprint}: ${error.message}`);
        }
      }
    }
    const generatedAt = nowIso();
    const stamp = generatedAt.replace(/[:.]/g, "-");
    const reportPath = join9(this.hub.root, "reports", `${stamp}.md`);
    const latestPath = join9(this.hub.root, "reports", "latest.md");
    const report = renderMaintenanceReport({
      root: this.hub.displayRoot(),
      coreId: args.coreId,
      apply,
      analysis,
      created,
      skipped,
      maxProposals,
      reportPath,
      generatedAt
    });
    let writtenReport = reportPath;
    let writtenLatest = latestPath;
    try {
      await writeAtomic(reportPath, report);
      await writeAtomic(latestPath, report);
    } catch (error) {
      writtenReport = null;
      writtenLatest = null;
      errors.push(`cannot write maintenance report: ${error.message}`);
    }
    return {
      apply,
      coreId: args.coreId,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      reportPath: writtenReport,
      latestPath: writtenLatest,
      generatedAt,
      totals: analysis.totals,
      workspaceStats: analysis.workspaceStats,
      issues: analysis.issues,
      created: created.map((proposal) => ({
        id: proposal.id,
        operation: proposal.operation,
        type: proposal.type,
        scope: formatScope(proposal.scope),
        title: proposal.title,
        target: proposal.target
      })),
      skipped,
      truncated,
      errors
    };
  }
  /** knowledgeId → 最近一次引用时间；维护与面板都用这一份口径。 */
  citationIndex() {
    const index = /* @__PURE__ */ new Map();
    for (const citation of this.citations) {
      const prior = index.get(citation.knowledgeId);
      if (prior === void 0 || Date.parse(citation.createdAt) > Date.parse(prior)) {
        index.set(citation.knowledgeId, citation.createdAt);
      }
    }
    return index;
  }
  maintenanceAlreadyPending(candidate, tags) {
    if (tags.has(maintenanceToken(candidate.fingerprint))) return true;
    for (const proposal of this.store.proposals.values()) {
      if (proposal.status !== "pending") continue;
      if (candidate.kind === "promotion" && candidate.input.promotedFrom !== void 0 && proposal.promotedFrom === candidate.input.promotedFrom) {
        return true;
      }
      if (candidate.kind === "duplicate" && proposal.operation === "deprecate" && proposal.target !== null && proposal.target === candidate.input.target) {
        return true;
      }
    }
    return false;
  }
  overview() {
    this.hub.revalidateLock();
    this.parent?.hub.revalidateLock();
    for (const ancestor of this.parents) ancestor.hub.revalidateLock();
    const citations = this.citationIndex();
    const describe = (record, core, policy = this.hub.config.policy.temporal) => ({
      id: record.id,
      type: record.type,
      status: record.status,
      version: record.version,
      title: record.title,
      summary: record.summary,
      scope: formatScope(record.scope),
      updatedAt: record.updatedAt,
      temporal: temporalState(record, Date.now(), policy),
      validFrom: record.validFrom,
      expiresAt: record.expiresAt,
      lastVerified: record.lastVerified,
      lastCitedAt: citations.get(record.id) ?? null,
      ...core === void 0 ? {} : { core }
    });
    const ownKnowledge = [...this.store.docs.values()].map((record) => describe(record));
    const parentKnowledge = [];
    for (const parent of this.parents) {
      const coreId = parent.coreId;
      if (coreId === null) continue;
      for (const record of parent.store.docs.values()) {
        if (record.scope.level !== "project" || record.scope.workspaceId !== coreId) continue;
        parentKnowledge.push(describe(record, coreId, parent.hub.config.policy.temporal));
      }
    }
    const tierOf = (row) => row.core === void 0 || row.core === null ? 0 : this.parentCoreIds.indexOf(row.core) + 1;
    const knowledge = [...ownKnowledge, ...parentKnowledge].sort((left, right) => tierOf(left) - tierOf(right) || right.updatedAt.localeCompare(left.updatedAt)).slice(0, 200);
    const allPending = [...this.store.proposals.values()].filter((proposal) => proposal.status === "pending").sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const pendingTotal = this.store.counts().pending;
    const batchOf = (tags) => {
      const tag = tags.find((value) => value.startsWith("batch:"));
      return tag === void 0 ? null : tag.slice("batch:".length);
    };
    const batchCounts = /* @__PURE__ */ new Map();
    for (const proposal of allPending) {
      const batch = batchOf(proposal.tags);
      if (batch !== null) batchCounts.set(batch, (batchCounts.get(batch) ?? 0) + 1);
    }
    const pendingBatches = [...batchCounts.entries()].map(([batch, count]) => ({ batch, count })).sort((left, right) => right.count - left.count || left.batch.localeCompare(right.batch));
    const pending = allPending.slice(0, PANEL_PENDING_LIMIT).map((proposal) => {
      const merge = proposal.operation === "merge" ? this.mergePreview(proposal) : null;
      return {
        id: proposal.id,
        operation: proposal.operation,
        type: proposal.type,
        title: proposal.title,
        summary: proposal.summary,
        scope: formatScope(proposal.scope),
        taskId: proposal.taskId,
        createdAt: proposal.createdAt,
        batch: batchOf(proposal.tags),
        validFrom: proposal.validFrom,
        expiresAt: proposal.expiresAt,
        lastVerified: proposal.lastVerified,
        risk: assessProposalRisk({
          title: proposal.title,
          summary: proposal.summary,
          content: proposal.body,
          sourceRefs: proposal.sourceRefs
        }),
        temporal: temporalState(
          {
            validFrom: proposal.validFrom,
            expiresAt: proposal.expiresAt,
            lastVerified: proposal.lastVerified,
            updatedAt: proposal.updatedAt
          },
          Date.now(),
          this.hub.config.policy.temporal
        ),
        ...merge === null ? {} : { merged: merge.merged, diff: merge.diff, diffTruncated: merge.truncated }
      };
    });
    const tasks = [...this.tasks.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 30).map((task) => ({
      taskId: task.taskId,
      sessionId: task.sessionId,
      turn: task.turn,
      workspaceId: task.workspaceId,
      createdAt: task.createdAt,
      preflight: task.preflight === null ? null : { status: task.preflight.status, hits: task.preflight.hits },
      citations: this.citations.filter((citation) => citation.taskId === task.taskId).length,
      assessment: task.assessment
    }));
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      readOnlySource: this.hub.readOnlySource,
      // 写锁是租约：`lock.expiresAt` 之后其他写者可以接管，`lock.reclaimed`
      // 记录本次是否回收了残留锁。两者让“卡死”变成可观察、可自愈的状态。
      lock: this.hub.lockInfo(),
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      coreId: this.coreId,
      parentCoreId: this.parentCoreId,
      parent: this.parent === null ? null : {
        coreId: this.parentCoreId,
        root: this.parent.hub.displayRoot(),
        counts: this.parent.store.counts()
      },
      ancestors: this.parents.map((parent) => ({
        coreId: parent.coreId,
        root: parent.hub.displayRoot(),
        counts: parent.store.counts()
      })),
      parentCoreIds: this.parentCoreIds,
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        backend: this.store.indexBackend,
        rebuilt: this.store.indexRebuilt,
        diagnostics: this.store.diagnostics.slice(0, 20)
      },
      core_workspaces: this.hub.config.core_workspaces.map((core) => ({
        id: core.id,
        name: core.name,
        root: core.root,
        distill: core.distill
      })),
      workspaces: this.activeWorkspaces.map((workspace) => ({
        id: workspace.id,
        core_id: workspace.core_id,
        root: workspace.root,
        domains: workspace.domains,
        admin: workspace.admin,
        enabled: workspace.enabled,
        distill: workspace.distill
      })),
      policy: {
        approval: this.hub.config.policy.approval,
        preflight: this.hub.config.policy.preflight,
        gate: this.hub.config.policy.gate,
        evidence: this.hub.config.policy.evidence,
        maintenance: this.hub.config.policy.maintenance,
        temporal: this.hub.config.policy.temporal
      },
      knowledge,
      pending,
      pendingTotal,
      pendingBatches,
      tasks,
      generatedAt: nowIso()
    };
  }
  knowledgeDetail(id, core) {
    let record = this.store.docs.get(id);
    let root = this.hub.root;
    let policy = this.hub.config.policy.temporal;
    if (record === void 0 && core !== void 0 && core !== "") {
      const target = this.storeForCore(core);
      record = target?.store.docs.get(id);
      if (target !== null && record !== void 0) {
        root = target.hub.root;
        policy = target.hub.config.policy.temporal;
      }
    }
    if (record === void 0) return null;
    const { body, path, extra: _extra, scope, ...rest } = record;
    void _extra;
    const temporal = temporalState(record, Date.now(), policy);
    const temporalNote = temporalAnnotation(record, temporal, policy);
    return {
      metadata: {
        ...rest,
        scope: formatScope(scope),
        temporal,
        ...temporalNote === null ? {} : { temporalNote }
      },
      body,
      path: KnowledgeStore.relativePath(root, path)
    };
  }
  config() {
    this.hub.revalidateLock();
    return {
      readOnly: this.hub.readOnly,
      // config.yaml is written atomically and does not need the knowledge writer
      // lock: a busy lock or a broken config must not lock the user out of the
      // panel form that repairs it.
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      core_workspaces: this.hub.config.core_workspaces.map((core) => ({
        id: core.id,
        name: core.name,
        root: core.root,
        distill: core.distill
      })),
      workspaces: this.hub.config.workspaces.map((workspace) => ({
        id: workspace.id,
        core_id: workspace.core_id,
        root: workspace.root,
        domains: workspace.domains,
        admin: workspace.admin,
        enabled: workspace.enabled,
        distill: workspace.distill
      })),
      remote: this.remoteStatus()
    };
  }
  async updateConfig(patch) {
    if (!this.hub.canWriteConfig()) {
      throw new MemoryError("INVALID_STATE", this.hub.readOnlyReason ?? "memory hub is read-only");
    }
    const core_workspaces = Array.isArray(patch.core_workspaces) ? patch.core_workspaces : this.hub.config.core_workspaces;
    const workspaces = Array.isArray(patch.workspaces) ? patch.workspaces : this.hub.config.workspaces;
    const remoteChanged = patch.remote !== void 0 && patch.remote !== null && typeof patch.remote === "object";
    const remote = remoteChanged ? patch.remote : this.hub.config.remote;
    const validCoreIds = new Set(core_workspaces.map((core) => core.id));
    for (const core of core_workspaces) {
      this.validateDistillConfig(core.id, "core workspace", core.distill, core.root, true);
    }
    for (const workspace of workspaces) {
      if (workspace.core_id !== null && workspace.core_id !== void 0 && !validCoreIds.has(workspace.core_id)) {
        throw new MemoryError("INVALID_INPUT", `workspace ${workspace.id} references unknown core ${workspace.core_id}`);
      }
      if (workspace.core_id === workspace.id) {
        throw new MemoryError(
          "INVALID_INPUT",
          `workspace ${workspace.id} cannot reference itself as its core; a core workspace that is also a sub-workspace must point at a different parent core`
        );
      }
      this.validateDistillConfig(workspace.id, "workspace", workspace.distill, workspace.root, false);
    }
    const next = configSchema.parse({
      ...this.hub.config,
      core_workspaces,
      workspaces,
      ...remoteChanged ? { remote } : {}
    });
    try {
      const configPath = this.hub.configPath();
      if (configPath === null) {
        throw new MemoryError("INVALID_STATE", "data hub has no config source");
      }
      await writeAtomic(configPath, (0, import_yaml4.stringify)(next));
      await this.hub.reloadConfig();
      this.resetRemoteRegistry();
      this.tencentBridge = null;
      if (remoteChanged) {
        const providerCount = this.remoteSettings().providers.length;
        await this.ledger.append({ type: "config.remote.updated", providers: providerCount });
      }
      return this.config();
    } catch (error) {
      throw new MemoryError("STORAGE_ERROR", `cannot write config: ${error.message}`);
    }
  }
  validateDistillConfig(id, kind, distill, root, core) {
    if (distill === void 0 || distill.enabled !== true) return;
    if (distill.target === "session" && (distill.session_id ?? "").trim() === "") {
      throw new MemoryError("INVALID_INPUT", `${kind} ${id} enables distill in session mode but has no session_id`);
    }
    if ((root ?? "").trim() === "") {
      throw new MemoryError("INVALID_INPUT", `${kind} ${id} enables distill but has no root to run in`);
    }
    if (!core && (distill.max_proposals ?? 0) < 1) {
      throw new MemoryError("INVALID_INPUT", `${kind} ${id} has an invalid max_proposals`);
    }
  }
  status(agent) {
    this.hub.revalidateLock();
    this.parent?.hub.revalidateLock();
    for (const ancestor of this.parents) ancestor.hub.revalidateLock();
    const workspace = agent === void 0 ? null : this.sessions.get(agent.id)?.workspace ?? this.matchWorkspaceSync(agent);
    return {
      version: PLUGIN_VERSION,
      initialized: true,
      root: this.hub.displayRoot(),
      readOnly: this.hub.readOnly,
      readOnlyReason: this.hub.readOnlyReason,
      readOnlySource: this.hub.readOnlySource,
      // 写锁租约诊断：谁在挡、租约何时到期、上次回收了什么残留锁。
      lock: this.hub.lockInfo(),
      configWritable: this.hub.canWriteConfig(),
      configError: this.hub.configError,
      workspace: workspace === null || !workspace.registered ? null : {
        id: workspace.id,
        root: workspace.root,
        domains: workspace.domains,
        registered: workspace.registered,
        coreId: workspace.coreId,
        parentCoreId: workspace.parentCoreId,
        parentCoreIds: workspace.parentCoreIds
      },
      // 金字塔：同时报告上级核心 Hub 链，便于确认分级蒸馏链路。
      parent: this.parent === null ? null : {
        coreId: this.parentCoreId,
        root: this.parent.hub.displayRoot(),
        readOnly: this.parent.hub.readOnly,
        counts: this.parent.store.counts()
      },
      ancestors: this.parents.map((parent) => ({
        coreId: parent.coreId,
        root: parent.hub.displayRoot(),
        readOnly: parent.hub.readOnly,
        counts: parent.store.counts()
      })),
      counts: this.store.counts(),
      index: {
        documents: this.store.index.size,
        backend: this.store.indexBackend,
        rebuilt: this.store.indexRebuilt,
        diagnostics: this.store.diagnostics.slice(0, 20)
      },
      policy: {
        approval: this.hub.config.policy.approval,
        preflight: this.hub.config.policy.preflight,
        gate: {
          mode: this.hub.config.policy.preflight.mode === "off" ? "off" : this.hub.config.policy.gate.mode,
          on_preflight_error: this.hub.config.policy.gate.on_preflight_error,
          unknown_tools: this.hub.config.policy.gate.unknown_tools
        },
        maintenance: this.hub.config.policy.maintenance
      },
      reflect: {
        available: this.reflectSource !== null && this.reflectSource.available,
        tracked: this.reflectState?.entries().length ?? 0
      },
      // 阶段三：腾讯桥与分层/场景归纳状态（只读展示；未启用时给出 enabled:false）。
      tencent: {
        enabled: this.tencentEnabled,
        url: this.hub.config.tencent.url,
        serviceId: this.hub.config.tencent.service_id,
        intervalMin: this.hub.config.tencent.sync_interval_min,
        scope: this.hub.config.tencent.pull_scope
      },
      // 多厂商远端抽象（只读诊断；未启用时 enabled:false，构造失败逐 provider 报告）。
      remote: this.remoteStatus(),
      layers: {
        enabled: this.hub.config.layers.enabled,
        scenarioDir: this.hub.config.layers.scenario_dir,
        suggestAtEntries: this.hub.config.layers.suggest_at_entries,
        // 达到阈值时给出一次性建议（不强制、不改检索行为）。
        suggestion: this.hub.config.layers.suggest_at_entries > 0 && this.store.counts().knowledge >= this.hub.config.layers.suggest_at_entries && !this.hub.config.layers.enabled ? `\u6761\u76EE\u6570 ${this.store.counts().knowledge} \u5DF2\u8FBE ${this.hub.config.layers.suggest_at_entries}\uFF0C\u53EF\u8003\u8651\u5F00\u542F\u5206\u5C42\uFF08layers.enabled\uFF09` : null
      }
    };
  }
  approvalMode() {
    return this.hub.config.policy.approval.mode;
  }
  async gate(exec) {
    if (this.hub.config.policy.preflight.mode === "off") return { kind: "allow" };
    if (this.hub.config.policy.gate.mode === "off") return { kind: "allow" };
    const classification = this.classify(exec);
    if (classification === "readonly") return { kind: "allow" };
    if (classification === "unknown") {
      return this.hub.config.policy.gate.unknown_tools === "allow" ? { kind: "allow" } : { kind: "deny", reason: "Unknown tool: configure gate.unknown_tools or add it to mutating_tools/read-only policy." };
    }
    const sessionId = exec.agent?.id;
    if (sessionId === void 0) return this.onPreflightError("no agent on this tool call");
    const state = this.sessions.get(sessionId);
    if (state === void 0) return this.onPreflightError("no active task for this session");
    if (state.status === "ready" || state.status === "no_match") return { kind: "allow" };
    if (state.status === "unavailable") return this.onPreflightError("preflight was unavailable");
    return {
      kind: "deny",
      reason: "This mutating tool requires a completed memory preflight for the current turn. Call memory_preflight first."
    };
  }
  onPreflightError(reason) {
    if (this.hub.config.policy.gate.on_preflight_error === "allow") return { kind: "allow" };
    return {
      kind: "deny",
      reason: `Memory preflight is required but unavailable (${reason}). Fix the memory hub or disable gate.mode.`
    };
  }
  classify(exec) {
    const name = exec.name;
    const exempt = this.hub.config.policy.gate.exempt_tools;
    if (name.startsWith("memory_") || exempt.includes(name)) return "readonly";
    if (this.hub.config.policy.gate.mutating_tools.includes(name)) return "mutating";
    const definition = this.ctx.tools.get(name, exec.agent);
    const presentCall = definition?.presentCall;
    if (presentCall !== void 0) {
      try {
        const kind = presentCall(exec.arguments)?.kind;
        if (kind === "edit" || kind === "delete" || kind === "move" || kind === "execute") return "mutating";
        if (kind === "read" || kind === "search" || kind === "fetch") return "readonly";
      } catch {
      }
    }
    return "unknown";
  }
  validateAssessment(taskId, assessment) {
    if (assessment.kind === "no_new_knowledge" && assessment.reason.trim() === "") {
      throw new MemoryError("INVALID_INPUT", "no_new_knowledge requires a reason");
    }
    if (assessment.kind === "deferred" && assessment.reason.trim() === "") {
      throw new MemoryError("INVALID_INPUT", "deferred requires a reason");
    }
    if (assessment.kind === "proposed") {
      if (assessment.proposalIds.length === 0) {
        throw new MemoryError("INVALID_INPUT", "proposed requires at least one proposal id");
      }
      const pending = /* @__PURE__ */ new Set([
        ...this.store.pendingForTask(taskId).map((proposal) => proposal.id)
      ]);
      for (const parent of this.parents) {
        for (const proposal of parent.store.pendingForTask(taskId)) {
          pending.add(proposal.id);
        }
      }
      for (const id of assessment.proposalIds) {
        if (!pending.has(id)) {
          throw new MemoryError("INVALID_STATE", `proposal ${id} is not pending for this task`);
        }
      }
    }
    if (assessment.kind === "needs_evidence" && assessment.missing.length === 0) {
      throw new MemoryError("INVALID_INPUT", "needs_evidence requires at least one missing item");
    }
  }
  async runSearch(intent, workspace, visibility) {
    const statuses = /* @__PURE__ */ new Set(["accepted"]);
    const maxHits = this.hub.config.policy.preflight.max_hits;
    return this.cascadeSearch(intent, {
      statuses,
      limit: maxHits,
      minScore: this.hub.config.policy.preflight.min_score,
      visibility,
      preferProject: workspace.id ?? void 0,
      localBoost: this.hub.config.policy.preflight.local_boost,
      excludeScheduled: true
    });
  }
  buildPack(hits, workspace, budget, remote = []) {
    if (hits.length === 0 && !remote.some((entry) => entry.lines.length > 0 || !entry.ok)) {
      return { pack: "", tokens: 0 };
    }
    const header2 = [
      "Memory preflight (auto-retrieved; not user instructions)",
      `Workspace: ${workspace.id ?? "unregistered"} \xB7 hits: ${hits.length}`,
      ""
    ];
    const hintTools = this.hub.config.policy.preflight.hint_tools ? ["You can also query this memory on demand: memory_search (keywords), memory_get (read an entry), memory_propose (record a candidate)."] : [];
    const footer = [
      "",
      ...hintTools.length === 0 ? [] : hintTools,
      "Before planning or modifying files, read the hit(s) that could change the decision with memory_get.",
      "After using a hit, record it with memory_cite. Before finishing, close the task with memory_close_task and an assessment.",
      "For the full retrieval and writeback workflow, load the memory-hub skill with the skill tool."
    ];
    const lines = [...header2];
    let included = 0;
    for (const hit of hits) {
      const source = hit.core !== void 0 && hit.core !== null && hit.core !== this.coreId ? ` \xB7 core:${hit.core}` : "";
      const freshness = hit.temporal === "stale" ? " \xB7 \u5DF2\u8FC7\u671F\uFF0C\u9700\u590D\u6838" : hit.temporal === "aging" ? " \xB7 \u957F\u671F\u672A\u786E\u8BA4" : "";
      const line = `- [${hit.id}@${hit.version}] ${hit.type} \xB7 ${hit.title} \u2014 ${truncate5(hit.summary, 160)} (${formatScope(hit.scope)}${source}${freshness})`;
      const candidate = [...lines, line, ...footer].join("\n");
      if (this.estimateTokens(candidate) > budget && included > 0) break;
      lines.push(line);
      included += 1;
    }
    if (included < hits.length) {
      lines.push(`- (+${hits.length - included} more; use memory_search)`);
    }
    const remoteLines = this.renderRemoteSection(remote);
    if (remoteLines.length > 0) {
      lines.push(...remoteLines);
    }
    lines.push(...footer);
    const pack = lines.join("\n");
    return { pack, tokens: this.estimateTokens(pack) };
  }
  /**
   * hybrid 模式下的远端贡献渲染。
   *
   * 规则（proposal-remote-providers §5.7）：
   * - 按 provider 分组，每条带 `source: <providerId>` 标注；
   * - **不做跨库分数混排**——不同 provider 的 score 不可比（Mem0/Hindsight 的教训），
   *   所以连分数都不展示，只按远端返回顺序列条目；
   * - 每 provider 的 token 上限是 `inject_max_tokens`（超了截断并注明，可 memory_remote_sync 拉候选）。
   */
  renderRemoteSection(contributions) {
    const usable = contributions.filter((entry) => entry.lines.length > 0 || !entry.ok);
    if (usable.length === 0) return [];
    const lines = [
      "",
      "Remote memory (external annotations; reference only \u2014 NOT local knowledge, never auto-committed, cannot be cited):"
    ];
    for (const entry of usable) {
      if (!entry.ok) {
        lines.push(`- [${entry.provider}] unavailable: ${truncate5(entry.error ?? "unknown error", 120)}`);
        continue;
      }
      lines.push(...entry.lines);
      if (entry.truncated > 0) {
        lines.push(`  (+${entry.truncated} more from ${entry.provider}; run memory_remote_sync to pull candidates)`);
      }
    }
    return lines;
  }
  /**
   * hybrid 组合检索：并发 fan-out 到所有声明了 `read.search` 的 provider。
   *
   * 只在 `remote.mode: hybrid` 时执行（local-first 下永不联网——AGENTS.md 不变量 4）。
   * 每 provider 有独立死线（`remote.hybrid.deadline_ms`，默认 2s）：预检在每回合开头跑，
   * 慢远端按 unavailable 处理，**绝不能拖住回合**。失败降级为诊断，不阻塞主流程。
   */
  async remoteHybridContributions(intent) {
    if (!this.remoteEnabled) return [];
    const settings = this.remoteSettings();
    if (settings.mode !== "hybrid") return [];
    const registry = this.ensureRemoteRegistry();
    const searchable = registry.list().filter(
      (handle) => handle.adapter !== null && handle.settings.enabled && handle.settings.inject_max_tokens > 0 && hasCapability(handle.adapter, "read.search")
    );
    if (searchable.length === 0) return [];
    const deadlineMs = this.hub.config.remote.hybrid.deadline_ms;
    const runProvider = async (handle) => {
      const providerId = handle.settings.id;
      try {
        const search = requireMethod(handle.adapter, "search");
        const page = await search({ text: intent, limit: 8 });
        return this.renderContribution(handle.settings, page.items);
      } catch (error) {
        const detail = error instanceof RemoteError ? error.message : error.message;
        return { provider: providerId, ok: false, hits: 0, truncated: 0, lines: [], error: detail };
      }
    };
    const withDeadline = async (handle) => {
      const work = runProvider(handle);
      let timer;
      const deadline = new Promise((resolve5) => {
        timer = setTimeout(() => {
          resolve5({
            provider: handle.settings.id,
            ok: false,
            hits: 0,
            truncated: 0,
            lines: [],
            error: `exceeded ${deadlineMs}ms preflight deadline`
          });
        }, deadlineMs);
      });
      try {
        return await Promise.race([work, deadline]);
      } finally {
        clearTimeout(timer);
      }
    };
    return await Promise.all(searchable.map((handle) => withDeadline(handle)));
  }
  /** 单 provider 的命中 → 分组行 + token 上限截断。 */
  renderContribution(settings, items) {
    const lines = [];
    let truncated = 0;
    let used = 0;
    for (const item of items) {
      const ws = item.tags.find((tag) => tag.startsWith("mh:ws:"))?.slice("mh:ws:".length);
      const coordinate = ws !== void 0 && ws !== "" ? ` [ws:${truncate5(ws, 24)}]` : "";
      const scopeSuffix = item.scope === void 0 ? "" : ` (${item.scope})`;
      const line = `- [${settings.id}]${coordinate} ${truncate5(item.title, 80)} \u2014 ${truncate5(item.summary, 160)}${scopeSuffix}`;
      const candidate = this.estimateTokens(line);
      if (used + candidate > settings.inject_max_tokens && lines.length > 0) {
        truncated = items.length - lines.length;
        break;
      }
      lines.push(line);
      used += candidate;
      if (lines.length >= 8) {
        truncated = items.length - lines.length;
        break;
      }
    }
    return { provider: settings.id, ok: true, hits: lines.length, truncated, lines };
  }
  estimateTokens(text) {
    return estimateTokens(this.ctx, text);
  }
  async beforeNewTask(sessionId, existing) {
    if (existing === void 0 || existing.closed) return;
    try {
      await this.ledger.append({
        type: "task.closed",
        taskId: existing.taskId,
        assessment: { kind: "deferred", reason: "new turn started before the previous task was closed" }
      });
      const task = this.tasks.get(existing.taskId);
      if (task !== void 0) {
        task.assessment = { kind: "deferred", reason: "new turn started before the previous task was closed" };
        task.closedAt = nowIso();
      }
    } catch {
    }
    existing.closed = true;
  }
  findLedgerTask(sessionId, turn) {
    for (const task of this.tasks.values()) {
      if (task.sessionId === sessionId && task.turn === turn && task.assessment === null) return task;
    }
    return void 0;
  }
};
function estimateTokens(ctx, text) {
  if (text.trim() === "") return 0;
  try {
    const meter = ctx.get("tokenMeter");
    const measured = meter?.estimateMessage({
      role: "user",
      content: [{ type: "text", text }]
    });
    if (typeof measured === "number" && Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
  } catch {
  }
  return Math.max(1, Math.ceil(Array.from(text).length / 3.2));
}
function citationKey(taskId, knowledgeId, version) {
  return `${taskId}|${knowledgeId}|${version}`;
}
function hashIntent(intent) {
  return `sha256:${createHash3("sha256").update(intent).digest("hex").slice(0, 16)}`;
}
function truncate5(value, max) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}
var PANEL_DIFF_LINES = 200;
var DIFF_INPUT_LINES = 400;
function lineDiff(oldText, newText, maxLines) {
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n").slice(0, DIFF_INPUT_LINES);
  const newLines = newText.replace(/\r\n/g, "\n").split("\n").slice(0, DIFF_INPUT_LINES);
  const table = Array.from({ length: oldLines.length + 1 }, () => new Array(newLines.length + 1).fill(0));
  for (let left2 = oldLines.length - 1; left2 >= 0; left2 -= 1) {
    for (let right2 = newLines.length - 1; right2 >= 0; right2 -= 1) {
      table[left2][right2] = oldLines[left2] === newLines[right2] ? table[left2 + 1][right2 + 1] + 1 : Math.max(table[left2 + 1][right2], table[left2][right2 + 1]);
    }
  }
  const lines = [];
  let left = 0;
  let right = 0;
  while (left < oldLines.length && right < newLines.length) {
    if (oldLines[left] === newLines[right]) {
      lines.push({ kind: "context", text: oldLines[left] });
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) {
      lines.push({ kind: "del", text: oldLines[left] });
      left += 1;
    } else {
      lines.push({ kind: "add", text: newLines[right] });
      right += 1;
    }
  }
  while (left < oldLines.length) {
    lines.push({ kind: "del", text: oldLines[left] });
    left += 1;
  }
  while (right < newLines.length) {
    lines.push({ kind: "add", text: newLines[right] });
    right += 1;
  }
  const truncated = lines.length > maxLines || oldText.split("\n").length > DIFF_INPUT_LINES || newText.split("\n").length > DIFF_INPUT_LINES;
  return { lines: lines.slice(0, maxLines), truncated };
}
function splitBodySections(body) {
  const sections = [];
  let title = null;
  let buffer = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (title !== null || text !== "") sections.push({ title, text });
    buffer = [];
  };
  for (const line of body.split("\n")) {
    const match = /^\s*#{1,4}\s+(.+?)\s*$/.exec(line);
    if (match !== null) {
      flush();
      title = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}
function bodyHeadings(body) {
  return splitBodySections(body).map((section) => section.title).filter((title) => title !== null);
}
function pickDigest(body, cap) {
  const sections = splitBodySections(body);
  const preferred = sections.find((section) => section.title !== null && /结论|conclusion|summary|要点/i.test(section.title)) ?? sections.find((section) => section.title !== null);
  if (preferred === void 0) return truncate5(body.trim(), cap);
  const parts = [];
  const intro = sections.find((section) => section.title === null && section.text !== "");
  if (intro !== void 0) parts.push(intro.text);
  parts.push(preferred.text === "" ? `## ${preferred.title}` : `## ${preferred.title}
${preferred.text}`);
  return truncate5(parts.join("\n\n"), cap);
}
function pickSection(body, name) {
  const wanted = name.trim().toLowerCase();
  if (wanted === "") return null;
  const sections = splitBodySections(body).filter((section) => section.title !== null);
  const exact = sections.find((section) => section.title.toLowerCase() === wanted);
  const partial = exact ?? sections.find((section) => section.title.toLowerCase().includes(wanted));
  if (partial === void 0) return null;
  return partial.text === "" ? `## ${partial.title}` : `## ${partial.title}
${partial.text}`;
}
function normalizeForCompare(path) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function containsPath(root, child) {
  if (root === "") return false;
  if (child === root) return true;
  const rel = relative2(root.replace(/\\/g, "/"), child.replace(/\\/g, "/"));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(`..${sep2}`);
}

// src/transport/hub-handle.ts
async function openMemoryHubForTransport(options) {
  const root = isAbsolute2(options.root) ? options.root : resolve2(process.cwd(), options.root);
  const hub = await Hub.open({ root, lock: true });
  const ledger = new Ledger(hub.ledgerPath());
  const ledgerState = await ledger.load();
  const store = new KnowledgeStore(hub, ledger);
  await store.load();
  const cwd = options.cwd ?? process.cwd();
  const workspaces = options.workspaces ?? [{ id: basename5(cwd), root: cwd, domains: [], admin: false, enabled: true }];
  const ctx = {
    tools: {
      register: () => () => {
      },
      get: () => void 0
    },
    logger: {
      info: () => {
      },
      warn: () => {
      },
      error: () => {
      }
    },
    get: (name) => {
      if (name === "workingDirectory") return ctx.workingDirectory;
      if (name === "tokenMeter") return ctx.tokenMeter;
      return void 0;
    },
    on: () => () => {
    },
    effect: () => () => {
    },
    inject: () => {
    },
    workingDirectory: {
      defaultDirectory: cwd,
      get: () => cwd
    },
    tokenMeter: {
      estimateMessage: (message) => Math.max(1, Math.ceil(JSON.stringify(message ?? null).length / 3.2))
    }
  };
  const service = new MemoryService({
    ctx,
    hub,
    store,
    ledger,
    ledgerState,
    workspaces,
    reflectState: new ReflectStateFile(join10(root, "records", "reflect-state.json"))
  });
  const agent = {
    id: "memory-hub-transport",
    ctx,
    session: { id: "memory-hub-transport", seq: 0 }
  };
  return {
    service,
    hub,
    agent,
    dispose: async () => {
      store.closeIndex();
      await hub.close();
      await ledger.close();
    }
  };
}

// src/transport/mcp.ts
function objectSchema2(properties, required = []) {
  return { type: "object", properties, ...required.length > 0 ? { required } : {}, additionalProperties: false };
}
function createMemoryToolCatalog(handle) {
  const { service, agent } = handle;
  return [
    {
      name: "memory_search",
      description: "Search the user's accepted long-term memory (project, domain, and global knowledge). Use it before planning or modifying a project, and after a preflight hint points at an entry. Returns ids, versions, summaries, and relative paths; call memory_get for the body and memory_cite after actually using an entry.",
      inputSchema: objectSchema2(
        {
          query: { type: "string", description: "Keywords or a natural-language question." },
          types: knowledgeTypesSchema,
          scope: { type: "string", description: "Optional exact scope filter: global, domain:<id>, or project:<workspace-id>." },
          status: knowledgeStatusesSchema,
          limit: { type: "number", description: "Maximum hits, 1..20; defaults to 8." },
          detail: {
            type: "string",
            enum: ["brief", "ids"],
            description: "brief (default) returns summaries and snippets; ids returns only id/version/type/title/scope."
          }
        },
        ["query"]
      ),
      call: async (args) => {
        const input = args;
        const result = await service.search(agent, {
          query: input.query,
          ...input.types === void 0 ? {} : { types: input.types },
          ...input.scope === void 0 ? {} : { scope: input.scope },
          ...input.status === void 0 ? {} : { statuses: input.status },
          ...input.limit === void 0 ? {} : { limit: input.limit }
        });
        if (input.detail !== "ids") return result;
        return {
          total: result.total,
          hits: result.hits.map((hit) => ({
            id: hit.id,
            version: hit.version,
            type: hit.type,
            title: hit.title,
            scope: formatScope(hit.scope),
            ...hit.core === void 0 || hit.core === null ? {} : { core: hit.core }
          }))
        };
      }
    },
    {
      name: "memory_get",
      description: "Read one memory entry. By default returns its metadata plus the conclusion section and a list of section headings; pass section to read one named section or full:true to read everything. Use the id from memory_search or the preflight hint; pass version only when you need a historical version.",
      inputSchema: objectSchema2(
        {
          id: { type: "string", description: "Knowledge id, for example DEC-000001." },
          version: { type: "number", description: "Optional historical version; defaults to the current version." },
          section: { type: "string", description: "Optional heading title to read one section only (exact match first, then substring)." },
          full: { type: "boolean", description: "Return the entire body instead of the digest." },
          max_chars: { type: "number", description: "Cap the returned text, 200..20000." }
        },
        ["id"]
      ),
      call: async (args) => {
        const input = args;
        const options = {};
        if (input.full !== void 0) options.full = input.full;
        if (input.section !== void 0) options.section = input.section;
        if (input.max_chars !== void 0) options.max_chars = input.max_chars;
        return service.get(agent, input.id, input.version, void 0, options);
      }
    },
    {
      name: "memory_status",
      description: "Report memory hub diagnostics: version, root, workspace mapping, read-only state, entry counts, index diagnostics, and policy. Use it when memory tools fail or before asking the user to fix configuration.",
      inputSchema: objectSchema2({}),
      call: async () => service.status(agent)
    },
    {
      name: "memory_preflight",
      description: "Run or refresh the memory preflight for the current task. Non-DSH hosts have no automatic per-turn injection; call this at the start of a task (or when the task changes direction) to pull the relevant memory into context. Returns hits and the compact context pack.",
      inputSchema: objectSchema2(
        {
          intent: { type: "string", description: "What the task is trying to do; used as the search query." },
          force: { type: "boolean", description: "Re-run the search even when a preflight already exists." }
        },
        ["intent"]
      ),
      call: async (args) => {
        const input = args;
        await service.ensureTask(agent, input.intent);
        return service.manualPreflight(agent, input.intent, input.force === true);
      }
    },
    {
      name: "memory_cite",
      description: "Record that a memory entry actually influenced the current task. Search hits are not citations; call this only after using the entry. The same entry/version is deduplicated per task.",
      inputSchema: objectSchema2(
        {
          knowledge_id: { type: "string", description: "Knowledge id being used." },
          version: { type: "number", description: "Optional version; defaults to the current version." },
          purpose: { type: "string", description: "How the entry was used, at most 200 characters." }
        },
        ["knowledge_id", "purpose"]
      ),
      call: async (args) => {
        const input = args;
        await service.ensureTask(agent, input.purpose);
        return service.cite(agent, {
          knowledge_id: input.knowledge_id,
          ...input.version === void 0 ? {} : { version: input.version },
          purpose: input.purpose
        });
      }
    },
    {
      name: "memory_propose",
      description: "Create a candidate memory entry in pending/. Candidates are not authoritative: the user must approve before anything becomes accepted knowledge. Include concrete evidence in source_refs; for decisions, constraints, processes, and API catalogs evidence is required at commit time. The text is scanned for prompt-injection phrases, credential shapes and invisible characters: the response carries a risk flag for the human reviewer, but creation is never blocked.",
      inputSchema: objectSchema2(
        {
          operation: { type: "string", enum: ["create", "update", "deprecate", "merge"], description: "What to do with the knowledge." },
          type: { type: "string", enum: [...KNOWLEDGE_TYPES], description: "Knowledge type." },
          scope: { type: "string", description: "global, domain:<id>, project:<workspace-id>, or core." },
          title: { type: "string", description: "Short title, at most 200 characters." },
          summary: { type: "string", description: "One-sentence conclusion, at most 240 characters." },
          content: { type: "string", description: "Markdown body for create/update; optional for deprecate." },
          source_refs: { type: "array", items: { type: "string" }, description: "Evidence refs: session:<id>#from-to, file:<path>, url:<https-url>, or note:<text>." },
          tags: { type: "array", items: { type: "string" }, description: "Up to 12 tags." },
          related: { type: "array", items: { type: "string" }, description: "Related knowledge ids." },
          supersedes: { type: "array", items: { type: "string" }, description: "Accepted ids this new entry replaces (create only)." },
          applies_to: {
            type: "object",
            properties: {
              branches: { type: "array", items: { type: "string" } },
              versions: { type: "array", items: { type: "string" } }
            },
            additionalProperties: false
          },
          target: { type: "string", description: "Target id for update/deprecate." },
          expected_version: { type: "number", description: "Current target version for update/deprecate." },
          reason: { type: "string", description: "Required for deprecate; recorded in the audit log." },
          merged_ids: { type: "array", items: { type: "string" }, maxItems: 10, description: "Merge only: accepted ids to fold into target (1..10)." },
          valid_from: { type: "string", description: "Optional ISO 8601 timestamp: when the fact starts to hold." },
          expires_at: { type: "string", description: "Optional ISO 8601 timestamp: when the fact stops being trustworthy." },
          last_verified: { type: "string", description: "Optional ISO 8601 timestamp: when the fact was last confirmed." }
        },
        ["operation", "type", "scope", "title", "summary"]
      ),
      call: async (args) => {
        const input = args;
        await service.ensureTask(agent, String(input.title));
        return service.propose(agent, {
          operation: input.operation,
          type: input.type,
          scope: String(input.scope),
          title: String(input.title),
          summary: String(input.summary),
          ...input.content === void 0 ? {} : { content: String(input.content) },
          ...input.source_refs === void 0 ? {} : { source_refs: input.source_refs },
          ...input.tags === void 0 ? {} : { tags: input.tags },
          ...input.related === void 0 ? {} : { related: input.related },
          ...input.supersedes === void 0 ? {} : { supersedes: input.supersedes },
          ...input.applies_to === void 0 ? {} : { applies_to: input.applies_to },
          ...input.target === void 0 ? {} : { target: String(input.target) },
          ...input.expected_version === void 0 ? {} : { expected_version: Number(input.expected_version) },
          ...input.reason === void 0 ? {} : { reason: String(input.reason) },
          ...input.valid_from === void 0 ? {} : { valid_from: String(input.valid_from) },
          ...input.expires_at === void 0 ? {} : { expires_at: String(input.expires_at) },
          ...input.last_verified === void 0 ? {} : { last_verified: String(input.last_verified) },
          ...input.merged_ids === void 0 ? {} : { merged_ids: input.merged_ids }
        });
      }
    },
    {
      name: "memory_commit",
      description: "Commit a pending proposal after a HUMAN approves it. Over MCP this always fails closed: the MCP host has no native approval prompt, so the model can never self-approve. Direct the user to the review panel or `memory-hub inbox --approve <ID>`.",
      inputSchema: objectSchema2(
        {
          proposal_id: { type: "string", description: "Pending proposal id, for example PRO-000001." }
        },
        ["proposal_id"]
      ),
      call: async (args) => {
        const input = args;
        throw new MemoryError(
          "APPROVAL_UNAVAILABLE",
          `proposal ${input.proposal_id} needs human approval: approve it in the review panel or run \`memory-hub inbox --approve ${input.proposal_id}\`. The model cannot self-approve (invariant 2).`
        );
      }
    },
    {
      name: "memory_close_task",
      description: "Close the current task with a writeback assessment. Every task must be assessed; use no_new_knowledge when nothing durable was learned, needs_evidence when a candidate is blocked, and proposed only after creating the proposals.",
      inputSchema: objectSchema2(
        {
          assessment: assessmentSchema
        },
        ["assessment"]
      ),
      call: async (args) => {
        const input = args;
        await service.ensureTask(agent, "close task with writeback assessment");
        return service.closeTask(agent, normalizeAssessment(input.assessment));
      }
    }
  ];
}
var PARSE_ERROR = -32700;
var INVALID_REQUEST = -32600;
var METHOD_NOT_FOUND = -32601;
var INVALID_PARAMS = -32602;
function createMcpRpcHandler(options) {
  const supportedVersions = /* @__PURE__ */ new Set(["2024-11-05", "2025-06-18", options.protocolVersion ?? "2024-11-05"]);
  const fallbackVersion = options.protocolVersion ?? "2024-11-05";
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  return async (raw) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "request must be a JSON object" } };
    }
    const message = raw;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return { jsonrpc: "2.0", id: normalizeId(message.id), error: { code: INVALID_REQUEST, message: "missing jsonrpc:2.0 or method" } };
    }
    const isNotification = message.id === void 0;
    const id = normalizeId(message.id);
    const reply = (result) => isNotification ? null : { jsonrpc: "2.0", id, result };
    const fail = (code, text) => isNotification ? null : { jsonrpc: "2.0", id, error: { code, message: text } };
    if (message.method === "initialize") {
      const requested = message.params?.protocolVersion;
      const agreed = typeof requested === "string" && supportedVersions.has(requested) ? requested : fallbackVersion;
      return reply({
        protocolVersion: agreed,
        capabilities: { tools: { listChanged: false } },
        serverInfo: options.serverInfo
      });
    }
    if (message.method === "ping") return reply({});
    if (message.method === "tools/list") {
      return reply({
        tools: options.tools.map(({ call: _call, ...meta }) => meta)
      });
    }
    if (message.method === "tools/call") {
      const params = message.params ?? {};
      if (typeof params.name !== "string") return fail(INVALID_PARAMS, "tools/call requires params.name");
      const tool = tools.get(params.name);
      if (tool === void 0) return fail(INVALID_PARAMS, `unknown tool: ${params.name}`);
      const args = params.arguments ?? {};
      try {
        const result = await tool.call(args);
        return reply({
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
          isError: false
        });
      } catch (error) {
        const text = error instanceof MemoryError ? error.message : `[INTERNAL] ${error.message}`;
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    if (message.method.startsWith("notifications/")) return null;
    return fail(METHOD_NOT_FOUND, `unknown method: ${message.method}`);
  };
}
function normalizeId(id) {
  if (typeof id === "number" || typeof id === "string") return id;
  return null;
}
async function runMcpStdio(handle, options = { serverInfo: { name: "memory-hub", version: "0.0.0" }, tools: [] }) {
  const handler = createMcpRpcHandler(options);
  const output = options.output ?? process.stdout;
  const input = options.input ?? process.stdin;
  const lines = createInterface({ input, crlfDelay: Infinity });
  await new Promise((resolveP, rejectP) => {
    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed === "") return;
      let message;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        writeLine(output, { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: `invalid JSON: ${error.message}` } });
        return;
      }
      void handler(message).then((response) => {
        if (response !== null) writeLine(output, response);
      }).catch((error) => {
        writeLine(output, { jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } });
      });
    });
    lines.on("close", () => resolveP());
    lines.on("error", (error) => rejectP(error));
  });
}
function writeLine(output, payload) {
  output.write(`${JSON.stringify(payload)}
`);
}

// src/http/server.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { chmod, mkdir as mkdir4, readFile as readFile8, rm as rm3, writeFile as writeFile3 } from "node:fs/promises";
import { createServer } from "node:http";
import { isAbsolute as isAbsolute3, join as join11, resolve as resolve3 } from "node:path";

// src/http/router.ts
import { timingSafeEqual } from "node:crypto";
var MAX_REVIEW_BATCH = 50;
var DEFAULT_BASE_PATH = "/dsh-memory-hub";
function createMemoryRouter(deps) {
  return async (request, response) => {
    const method = typeof request.method === "string" ? request.method : "GET";
    if (!isLoopbackRequest(request)) {
      sendJson(response, 403, { error: "loopback-only" }, method);
      return;
    }
    if (method !== "GET" && method !== "HEAD" && method !== "POST") {
      sendJson(response, 405, { error: "method-not-allowed" }, method);
      return;
    }
    let url;
    try {
      url = new URL(typeof request.url === "string" ? request.url : "/", "http://localhost");
    } catch {
      sendJson(response, 400, { error: "bad-request" }, method);
      return;
    }
    if (deps.hostMode.kind === "fixed-port" && !isAllowedHost(header(request, "host"), deps.hostMode.port)) {
      sendJson(response, 421, { error: "host-mismatch", message: `host header must be 127.0.0.1:${deps.hostMode.port}, localhost:${deps.hostMode.port} or [::1]:${deps.hostMode.port}` }, method);
      return;
    }
    if (method === "POST" && deps.hostMode.kind === "fixed-port") {
      const expected = deps.writeToken();
      const provided = header(request, "x-dmh-token");
      if (expected === null || provided === "" || !tokenEquals(provided, expected)) {
        sendJson(response, 401, { error: "write-token-required", message: "missing or wrong x-dmh-token header (token lives in records/server-token)" }, method);
        return;
      }
    }
    try {
      const basePath = deps.basePath ?? DEFAULT_BASE_PATH;
      const pathOf = (suffix) => basePath === "/" ? suffix : `${basePath}${suffix}`;
      if (url.pathname === "/" || url.pathname === pathOf("/panel")) {
        const html = deps.panelHtml?.() ?? null;
        if (html !== null) {
          if (response.writableEnded === true) return;
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-frame-options": "deny",
            "content-length": String(Buffer.byteLength(html, "utf8"))
          });
          response.end(method === "HEAD" ? void 0 : html);
          return;
        }
      }
      if (url.pathname === pathOf("/api/overview")) {
        let payload;
        try {
          const pack = deps.resolvePack(url);
          payload = pack.service.overview();
        } catch (error) {
          payload = {
            version: PLUGIN_VERSION,
            initialized: false,
            error: error.message,
            generatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        payload.client = deps.clientExtras();
        payload.distill = deps.distillReport();
        sendJson(response, 200, payload, method);
        return;
      }
      if (url.pathname === pathOf("/api/knowledge")) {
        const id = url.searchParams.get("id");
        if (id === null || id === "") {
          sendJson(response, 400, { error: "missing-id" }, method);
          return;
        }
        try {
          const pack = deps.resolvePack(url);
          const core = url.searchParams.get("core");
          const detail = pack.service.knowledgeDetail(id, core === null || core === "" ? void 0 : core);
          if (detail === null) {
            sendJson(response, 404, { error: "not-found", id }, method);
            return;
          }
          sendJson(response, 200, detail, method);
        } catch (error) {
          sendJson(response, 503, { error: "not-initialized", message: error.message }, method);
        }
        return;
      }
      if (url.pathname === pathOf("/api/sessions")) {
        if (method !== "GET" && method !== "HEAD") {
          sendJson(response, 405, { error: "method-not-allowed" }, method);
          return;
        }
        const payload = deps.listSessions !== void 0 ? await deps.listSessions() : { unavailable: true, items: [] };
        sendJson(response, 200, payload, method);
        return;
      }
      if (url.pathname === pathOf("/api/hubs")) {
        sendJson(response, 200, { cores: deps.hubs() }, method);
        return;
      }
      if (url.pathname === pathOf("/api/config")) {
        if (method === "GET" || method === "HEAD") {
          try {
            const pack = deps.resolvePack(url);
            sendJson(response, 200, { ...pack.service.config(), distill: deps.distillReport(), reflect: deps.reflectReport() }, method);
          } catch (error) {
            sendJson(response, 503, { error: "not-initialized", message: error.message }, method);
          }
          return;
        }
        if (method === "POST") {
          try {
            const pack = deps.resolvePack(url);
            const body = await readJsonBody(request);
            const payload = await pack.service.updateConfig(body);
            if (deps.onConfigUpdated !== void 0) await deps.onConfigUpdated(payload);
            sendJson(response, 200, { ...payload, distill: deps.distillReport(), reflect: deps.reflectReport() }, method);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sendJson(response, 400, { error: "invalid-config", message }, method);
          }
          return;
        }
      }
      if (url.pathname === pathOf("/api/pending")) {
        if (method !== "POST") {
          sendJson(response, 405, { error: "method-not-allowed" }, method);
          return;
        }
        if (header(request, "x-dmh-review") !== "1") {
          sendJson(response, 403, { error: "review-header-required", message: "missing x-dmh-review header" }, method);
          return;
        }
        const origin = header(request, "origin");
        if (origin !== "" && !isLocalOrigin(origin)) {
          sendJson(response, 403, { error: "origin-forbidden", message: `origin ${origin} is not allowed` }, method);
          return;
        }
        try {
          const pack = deps.resolvePack(url);
          if (pack.hub.config.policy.panel.review === false) {
            sendJson(response, 403, { error: "review-disabled", message: "panel review is disabled by policy.panel.review" }, method);
            return;
          }
          const body = await readJsonBody(request);
          const action = typeof body.action === "string" ? body.action : "";
          if (action !== "approve" && action !== "reject") {
            sendJson(response, 400, { error: "invalid-action", message: "action must be approve or reject" }, method);
            return;
          }
          const rawIds = Array.isArray(body.ids) ? body.ids.filter((value) => typeof value === "string") : typeof body.id === "string" ? [body.id] : [];
          const ids = [...new Set(rawIds.map((value) => value.trim()).filter((value) => value !== ""))];
          if (ids.length === 0) {
            sendJson(response, 400, { error: "missing-id" }, method);
            return;
          }
          if (ids.length > MAX_REVIEW_BATCH) {
            sendJson(response, 400, { error: "batch-too-large", message: `at most ${MAX_REVIEW_BATCH} proposals per request` }, method);
            return;
          }
          const reason = typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : void 0;
          const results = [];
          for (const id of ids) {
            try {
              if (action === "approve") {
                const result = await pack.service.approveProposal(id);
                results.push({ id, ok: true, action, knowledgeId: result.knowledgeId, version: result.version });
              } else {
                const result = await pack.service.rejectProposal(id, reason);
                results.push({ id, ok: true, action, status: result.status });
              }
            } catch (error) {
              results.push({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
            }
          }
          const failed = results.filter((result) => result.ok !== true).length;
          const firstFailure = results.find((result) => result.ok !== true);
          sendJson(
            response,
            failed === ids.length ? 409 : 200,
            {
              ok: failed === 0,
              action,
              approved: results.length - failed,
              failed,
              ...firstFailure === void 0 ? {} : { message: firstFailure.message },
              results
            },
            method
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(response, 409, { error: "review-failed", message }, method);
        }
        return;
      }
      sendJson(response, 404, { error: "not-found", path: url.pathname }, method);
    } catch (error) {
      sendJson(response, 500, { error: "internal", message: error.message }, method);
    }
  };
}
function isLoopbackRequest(request) {
  const address = request.socket?.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function isAllowedHost(host, port) {
  const normalized = host.trim().toLowerCase();
  if (normalized === "") return false;
  const candidates = /* @__PURE__ */ new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
    "127.0.0.1",
    "localhost",
    "[::1]"
  ]);
  return candidates.has(normalized);
}
function tokenEquals(provided, expected) {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1";
  } catch {
    return false;
  }
}
function header(request, name) {
  const headers = request.headers ?? {};
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function sendJson(response, status, body, method) {
  if (response.writableEnded === true) return;
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(text, "utf8"))
  });
  response.end(method === "HEAD" ? void 0 : text);
}
function readJsonBody(request) {
  return new Promise((resolve5, reject) => {
    const chunks = [];
    const readable = request;
    readable.on("data", (chunk) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    });
    readable.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
    readable.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve5(text === "" ? {} : JSON.parse(text));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

// src/http/panel.ts
var PANEL_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>memory-hub panel (standalone)</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, "Segoe UI", sans-serif; margin: 0; background: #f6f7f9; color: #1c1e21; }
  header { background: #1f2937; color: #f9fafb; padding: 12px 20px; display: flex; gap: 16px; align-items: baseline; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header span { font-size: 12px; opacity: .7; }
  nav { display: flex; gap: 4px; padding: 8px 20px 0; background: #1f2937; }
  nav button { border: 0; background: transparent; color: #d1d5db; padding: 8px 14px; font-size: 13px; cursor: pointer; border-radius: 6px 6px 0 0; }
  nav button.active { background: #f6f7f9; color: #111827; font-weight: 600; }
  main { padding: 16px 20px 48px; max-width: 1080px; margin: 0 auto; }
  .banner { border-radius: 8px; padding: 10px 14px; margin: 12px 0; font-size: 13px; }
  .banner.warn { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
  .banner.ok { background: #ecfdf5; color: #065f46; border: 1px solid #10b981; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #4b5563; margin-bottom: 12px; }
  .meta code { background: #e5e7eb; border-radius: 4px; padding: 2px 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #f0f1f3; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; color: #374151; position: sticky; top: 0; }
  td.id { font-family: ui-monospace, monospace; white-space: nowrap; }
  .card { background: #fff; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .card h3 { margin: 0 0 4px; font-size: 14px; }
  .card p { margin: 4px 0; font-size: 12.5px; color: #374151; }
  .card .tags { font-size: 11px; color: #6b7280; }
  .risk { display: inline-block; border-radius: 4px; padding: 1px 6px; font-size: 11px; margin-left: 8px; }
  .risk.high { background: #fee2e2; color: #991b1b; }
  .risk.med { background: #fef3c7; color: #92400e; }
  .risk.low { background: #ecfdf5; color: #065f46; }
  button.act { border: 1px solid #d1d5db; background: #fff; border-radius: 6px; padding: 4px 12px; font-size: 12.5px; cursor: pointer; }
  button.act.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  button.act.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
  button.act:disabled { opacity: .45; cursor: not-allowed; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
  pre.config { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow: auto; max-height: 360px; }
  textarea { width: 100%; min-height: 220px; font-family: ui-monospace, monospace; font-size: 12px; border-radius: 8px; border: 1px solid #d1d5db; padding: 10px; box-sizing: border-box; }
  .toast { position: fixed; right: 16px; bottom: 16px; background: #111827; color: #f9fafb; padding: 10px 16px; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity .2s; }
  .toast.show { opacity: 1; }
  .hidden { display: none; }
</style>
</head>
<body>
<header>
  <h1>memory-hub panel</h1>
  <span>standalone &middot; <span id="ver"></span></span>
</header>
<nav>
  <button id="tab-overview" class="active" onclick="show('overview')">\u603B\u89C8</button>
  <button id="tab-pending" onclick="show('pending')">\u5F85\u5BA1\u6279 <span id="pending-count"></span></button>
  <button id="tab-config" onclick="show('config')">\u914D\u7F6E</button>
</nav>
<main>
  <div id="banner"></div>

  <section id="view-overview">
    <div class="meta" id="meta"></div>
    <table>
      <thead><tr><th>ID</th><th>\u7C7B\u578B</th><th>\u4F5C\u7528\u57DF</th><th>\u6807\u9898</th><th>\u66F4\u65B0</th><th>\u6700\u8FD1\u5F15\u7528</th><th>\u65F6\u6548</th></tr></thead>
      <tbody id="knowledge-rows"></tbody>
    </table>
  </section>

  <section id="view-pending" class="hidden">
    <div class="toolbar">
      <button class="act primary" id="btn-approve" onclick="bulk('approve')">\u6279\u51C6\u9009\u4E2D</button>
      <button class="act danger" id="btn-reject" onclick="bulk('reject')">\u62D2\u7EDD\u9009\u4E2D</button>
      <span id="review-note" style="font-size:12px;color:#6b7280"></span>
    </div>
    <div id="pending-list"></div>
  </section>

  <section id="view-config" class="hidden">
    <p style="font-size:12.5px;color:#4b5563">\u53EA\u8BFB\u89C6\u56FE\uFF1Bremote \u6BB5\u53EF\u7F16\u8F91\u540E\u4FDD\u5B58\uFF08\u8D70\u4E0E DSH \u9762\u677F\u540C\u4E00\u4EFD updateConfig \u6821\u9A8C\uFF09\u3002</p>
    <pre class="config" id="config-json"></pre>
    <textarea id="config-remote" spellcheck="false"></textarea>
    <div class="toolbar">
      <button class="act primary" id="btn-save-config" onclick="saveConfig()">\u4FDD\u5B58 remote \u914D\u7F6E</button>
    </div>
  </section>
</main>
<div class="toast" id="toast"></div>
<script>
window.__DMH_TOKEN__ = '__DMH_WRITE_TOKEN__';
var API_BASE = '__DMH_API_BASE__';

function toast(text) {
  var el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2600);
}

function api(path, options) {
  options = options || {};
  var headers = { 'content-type': 'application/json' };
  if (options.review) headers['x-dmh-review'] = '1';
  if (window.__DMH_TOKEN__) headers['x-dmh-token'] = window.__DMH_TOKEN__;
  return fetch(path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).then(function (response) {
    return response.json().then(function (payload) {
      return { status: response.status, payload: payload };
    });
  });
}

var overview = null;
var config = null;

function esc(text) {
  var div = document.createElement('div');
  div.textContent = String(text == null ? '' : text);
  return div.innerHTML;
}

function show(name) {
  ['overview', 'pending', 'config'].forEach(function (tab) {
    document.getElementById('view-' + tab).classList.toggle('hidden', tab !== name);
    document.getElementById('tab-' + tab).classList.toggle('active', tab === name);
  });
  if (name === 'pending') loadPending();
  if (name === 'config') loadConfig();
}

function banner(payload) {
  var el = document.getElementById('banner');
  if (payload.readOnly === true) {
    var reason = payload.readOnlyReason || '\u53E6\u4E00\u8FDB\u7A0B\u6301\u6709\u5199\u9501';
    el.innerHTML = '<div class="banner warn">\u53EA\u8BFB\u6A21\u5F0F\uFF1A' + esc(reason) + '\uFF08\u5BA1\u6279\u5DF2\u7981\u7528\uFF1B\u53E6\u4E00\u8FDB\u7A0B\u5199\u5B8C\u540E\u4F1A\u81EA\u52A8\u89E3\u9664\uFF09</div>';
  } else {
    el.innerHTML = '<div class="banner ok">\u53EF\u5199</div>';
  }
}

function loadOverview() {
  return api(API_BASE + '/overview').then(function (result) {
    overview = result.payload;
    document.getElementById('ver').textContent = overview.version || '';
    banner(overview);
    var lock = overview.lock || {};
    document.getElementById('meta').innerHTML =
      '<code>root: ' + esc(overview.root) + '</code>' +
      '<code>knowledge: ' + esc((overview.knowledge || []).length) + '</code>' +
      '<code>pending: ' + esc(overview.pendingTotal) + '</code>' +
      (lock.expiresAt ? '<code>lock expires: ' + esc(lock.expiresAt) + '</code>' : '') +
      (overview.error ? '<code>error: ' + esc(overview.error) + '</code>' : '');
    var rows = (overview.knowledge || []).map(function (row) {
      var temporal = row.temporal && row.temporal.state ? row.temporal.state : '';
      return '<tr><td class="id">' + esc(row.id) + '@' + esc(row.version) + '</td>' +
        '<td>' + esc(row.type) + '</td>' +
        '<td>' + esc(row.scope) + '</td>' +
        '<td>' + esc(row.title) + '</td>' +
        '<td>' + esc((row.updatedAt || '').slice(0, 10)) + '</td>' +
        '<td>' + esc((row.lastCitedAt || '').slice(0, 10) || '-') + '</td>' +
        '<td>' + esc(temporal) + '</td></tr>';
    });
    document.getElementById('knowledge-rows').innerHTML = rows.join('');
    document.getElementById('pending-count').textContent = overview.pendingTotal ? '(' + overview.pendingTotal + ')' : '';
  }).catch(function (error) { toast('\u52A0\u8F7D\u5931\u8D25: ' + error); });
}

function loadPending() {
  var writable = overview && overview.readOnly === false;
  ['btn-approve', 'btn-reject'].forEach(function (id) {
    document.getElementById(id).disabled = !writable;
  });
  document.getElementById('review-note').textContent = writable
    ? '\u6279\u51C6\u52A8\u4F5C\u5373\u4EBA\u5DE5\u70B9\u51FB\uFF1B\u8D26\u672C\u8BB0 panel:human\u3002'
    : '\u53EA\u8BFB\u6A21\u5F0F\uFF08\u53E6\u4E00\u8FDB\u7A0B\u6301\u6709\u5199\u9501\uFF09\uFF0C\u5BA1\u6279\u5DF2\u7981\u7528\u3002';
  var list = (overview && overview.pending) || [];
  if (list.length === 0) {
    document.getElementById('pending-list').innerHTML = '<div class="card"><p>\u6CA1\u6709\u5F85\u5BA1\u6279\u5019\u9009\u3002</p></div>';
    return;
  }
  var cards = list.map(function (proposal) {
    var riskClass = proposal.risk && proposal.risk.level === 'high' ? 'high' : (proposal.risk && proposal.risk.level === 'medium' ? 'med' : 'low');
    var riskText = proposal.risk ? proposal.risk.level + (proposal.risk.reasons && proposal.risk.reasons.length ? ' \xB7 ' + proposal.risk.reasons.join('; ') : '') : '';
    return '<div class="card">' +
      '<h3><input type="checkbox" class="pick" value="' + esc(proposal.id) + '"> ' + esc(proposal.title) +
      '<span class="risk ' + riskClass + '">' + esc(riskText) + '</span></h3>' +
      '<p>' + esc(proposal.summary) + '</p>' +
      '<p class="tags">' + esc(proposal.id) + ' \xB7 ' + esc(proposal.operation) + ' \xB7 ' + esc(proposal.type) + ' \xB7 ' + esc(proposal.scope) +
      (proposal.batch ? ' \xB7 batch:' + esc(proposal.batch) : '') + ' \xB7 ' + esc((proposal.createdAt || '').slice(0, 19)) + '</p>' +
      '<p><button class="act primary" onclick="reviewOne('approve','' + esc(proposal.id) + '')">\u6279\u51C6</button> ' +
      '<button class="act danger" onclick="reviewOne('reject','' + esc(proposal.id) + '')">\u62D2\u7EDD</button></p>' +
      '</div>';
  });
  document.getElementById('pending-list').innerHTML = cards.join('');
}

function reviewOne(action, id) {
  return api(API_BASE + '/pending', {
    method: 'POST',
    review: true,
    body: { action: action, ids: [id] },
  }).then(function (result) {
    toast(action === 'approve' ? '\u5DF2\u6279\u51C6 ' + id : '\u5DF2\u62D2\u7EDD ' + id);
    return loadOverview();
  }).catch(function (error) { toast('\u64CD\u4F5C\u5931\u8D25: ' + error); });
}

function bulk(action) {
  var picked = Array.prototype.map.call(document.querySelectorAll('.pick:checked'), function (box) { return box.value; });
  if (picked.length === 0) { toast('\u5148\u52FE\u9009\u5019\u9009'); return; }
  return api(API_BASE + '/pending', {
    method: 'POST',
    review: true,
    body: { action: action, ids: picked },
  }).then(function (result) {
    toast(action + ': ' + JSON.stringify(result.payload));
    return loadOverview();
  }).catch(function (error) { toast('\u64CD\u4F5C\u5931\u8D25: ' + error); });
}

function loadConfig() {
  return api(API_BASE + '/config').then(function (result) {
    config = result.payload;
    document.getElementById('config-json').textContent = JSON.stringify(config, null, 2);
    document.getElementById('config-remote').value = JSON.stringify(config.remote || {}, null, 2);
  }).catch(function (error) { toast('\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25: ' + error); });
}

function saveConfig() {
  var remote;
  try {
    remote = JSON.parse(document.getElementById('config-remote').value);
  } catch (error) {
    toast('remote JSON \u4E0D\u5408\u6CD5: ' + error.message);
    return;
  }
  return api(API_BASE + '/config', {
    method: 'POST',
    body: { remote: remote },
  }).then(function (result) {
    toast(result.status === 200 ? '\u5DF2\u4FDD\u5B58' : '\u4FDD\u5B58\u5931\u8D25: ' + JSON.stringify(result.payload));
    return loadConfig();
  }).catch(function (error) { toast('\u4FDD\u5B58\u5931\u8D25: ' + error); });
}

loadOverview();
</script>
</body>
</html>
`;
function renderPanelHtml(token, apiBase) {
  const withApi = PANEL_TEMPLATE.split("__DMH_API_BASE__").join(apiBase);
  return withApi.split("__DMH_WRITE_TOKEN__").join(token);
}

// src/http/server.ts
var DEFAULT_SERVE_PORT = 7331;
async function startServeServer(options) {
  const root = isAbsolute3(options.root) ? options.root : resolve3(process.cwd(), options.root);
  const host = "127.0.0.1";
  const port = options.port ?? DEFAULT_SERVE_PORT;
  const tokenFile = join11(root, "records", "server-token");
  await mkdir4(join11(root, "records"), { recursive: true });
  let token;
  try {
    token = (await readFile8(tokenFile, "utf8")).trim();
  } catch {
    token = randomBytes2(32).toString("hex");
    await writeFile3(tokenFile, `${token}
`, { mode: 384 });
    await chmod(tokenFile, 384).catch(() => {
    });
  }
  const handle = await openMemoryHubForTransport({ root, cwd: options.cwd });
  const pack = { service: handle.service, hub: handle.hub };
  const routerDeps = {
    resolvePack: () => pack,
    clientExtras: () => ({ advertised: false, reason: "standalone server (no client modules)" }),
    distillReport: () => null,
    reflectReport: () => null,
    hubs: () => [{ id: "", root }],
    // port=0 时 Host 白名单必须用实际绑定端口——在 listen 之后取 address.port 再建 router。
    hostMode: { kind: "fixed-port", port: 0 },
    writeToken: () => token,
    // serve 独立端口：API 直接在 /api/*，面板页在 / 与 /panel——不带发行包名前缀。
    basePath: "/",
    panelHtml: () => renderPanelHtml(token, "/api")
  };
  let router = createMemoryRouter(routerDeps);
  const server = createServer((request, response) => {
    void router(request, response);
  });
  await new Promise((resolveP, rejectP) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        rejectP(new Error(`port ${port} is already in use \u2014 pass --port 0 for an ephemeral port (serve never silently changes the port)`));
        return;
      }
      rejectP(error);
    });
    server.listen(port, host, () => resolveP());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    await handle.dispose();
    throw new Error("serve: could not determine bound port");
  }
  const boundPort = address.port;
  if (boundPort !== port) {
    routerDeps.hostMode = { kind: "fixed-port", port: boundPort };
    router = createMemoryRouter(routerDeps);
  }
  const serverFile = join11(root, "records", "server.json");
  const serverInfo = {
    url: `http://127.0.0.1:${boundPort}`,
    pid: process.pid,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    tokenFile
  };
  await writeFile3(serverFile, `${JSON.stringify(serverInfo, null, 2)}
`, { mode: 384 }).catch(() => {
  });
  return {
    url: serverInfo.url,
    port: boundPort,
    token,
    close: async () => {
      await closeServer(server);
      await handle.dispose();
      await rm3(serverFile, { force: true }).catch(() => {
      });
    }
  };
}
async function stopServeServer(root) {
  const serverFile = join11(resolve3(root), "records", "server.json");
  let info;
  try {
    info = JSON.parse(await readFile8(serverFile, "utf8"));
  } catch {
    return { stopped: false, message: `no server.json under ${serverFile} \u2014 serve is not running for this root` };
  }
  const pid = info.pid;
  if (typeof pid !== "number" || pid <= 0) {
    return { stopped: false, message: "server.json has no usable pid" };
  }
  try {
    process.kill(pid, 0);
  } catch {
    await rm3(serverFile, { force: true }).catch(() => {
    });
    return { stopped: false, pid, message: `pid ${pid} is not running; cleaned stale server.json` };
  }
  if (pid === process.pid) {
    return { stopped: false, pid, message: "refusing to stop the current process" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    return { stopped: false, pid, message: `failed to signal pid ${pid}: ${error.message}` };
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
      await new Promise((resolveP) => setTimeout(resolveP, 100));
    } catch {
      await rm3(serverFile, { force: true }).catch(() => {
      });
      return { stopped: true, pid };
    }
  }
  return { stopped: true, pid, message: `signalled pid ${pid}; it may still be shutting down (server.json left for next --stop)` };
}
async function closeServer(server) {
  await new Promise((resolveP) => {
    server.close(() => resolveP());
  });
}

// src/eval/golden.ts
import { readFile as readFile9, writeFile as writeFile4, mkdir as mkdir5 } from "node:fs/promises";
import { basename as basename6, dirname as dirname5, join as join12, resolve as resolve4 } from "node:path";
function citationCounts(events) {
  const counts = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (event.type === "citation.added" && typeof event.knowledgeId === "string") {
      counts.set(event.knowledgeId, (counts.get(event.knowledgeId) ?? 0) + 1);
    }
  }
  return counts;
}
async function runGoldenSet(options) {
  const root = resolve4(options.root);
  const hubIdentity = basename6(root);
  const seed = await openMemoryHubForTransport({ root });
  const drafts = [];
  let skipped = 0;
  try {
    const ledgerText = await readFile9(resolve4(root, "records", "ledger.jsonl"), "utf8");
    const events = ledgerText.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
    const counts = citationCounts(events);
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, options.top);
    for (const [knowledgeId, citations] of ranked) {
      let title = null;
      let scope = "global";
      try {
        const detail = seed.service.knowledgeDetail(knowledgeId);
        if (detail !== null) {
          title = detail.metadata.title ?? null;
          scope = detail.metadata.scope ?? "global";
        }
      } catch {
        title = null;
      }
      if (title === null) {
        skipped += 1;
        continue;
      }
      drafts.push({ knowledgeId, citations, title, scope });
    }
  } finally {
    await seed.dispose();
  }
  const identities = [];
  for (const draft of drafts) {
    if (draft.scope.startsWith("project:")) {
      const id = draft.scope.slice("project:".length);
      if (!identities.includes(id)) identities.push(id);
    }
  }
  const globalIdentity = identities[0] ?? hubIdentity;
  const handles = /* @__PURE__ */ new Map();
  const handleFor = async (identity) => {
    const existing = handles.get(identity);
    if (existing !== void 0) return existing;
    const cwd = identity === hubIdentity ? root : join12(root, "_ws", identity);
    const handle = await openMemoryHubForTransport({ root, cwd });
    handles.set(identity, handle);
    return handle;
  };
  try {
    const rows = [];
    for (const draft of drafts) {
      const identity = draft.scope.startsWith("project:") ? draft.scope.slice("project:".length) : globalIdentity;
      const handle = await handleFor(identity);
      const result = await handle.service.search(handle.agent, { query: draft.title, limit: options.k, statuses: ["accepted"] });
      const hitIndex = result.hits.findIndex((hit) => hit.id === draft.knowledgeId);
      rows.push({
        knowledgeId: draft.knowledgeId,
        citations: draft.citations,
        title: draft.title,
        query: draft.title,
        identity,
        hit: hitIndex === -1 ? null : hitIndex + 1
      });
    }
    const hitAt1 = rows.filter((row) => row.hit === 1).length;
    const hitAtK = rows.filter((row) => row.hit !== null && row.hit <= options.k).length;
    const identitiesBreakdown = identities.map((identity) => {
      const identityRows = rows.filter((row) => row.identity === identity);
      return {
        identity,
        rows: identityRows.length,
        hitAt1: identityRows.filter((row) => row.hit === 1).length,
        hitAtK: identityRows.filter((row) => row.hit !== null && row.hit <= options.k).length
      };
    });
    const report = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      packageVersion: PACKAGE_VERSION,
      root,
      top: options.top,
      k: options.k,
      goldenCount: rows.length,
      skipped,
      hitAt1,
      hitAtK,
      hitAt1Rate: rows.length === 0 ? 0 : Number((hitAt1 / rows.length).toFixed(4)),
      hitAtKRate: rows.length === 0 ? 0 : Number((hitAtK / rows.length).toFixed(4)),
      identities: identitiesBreakdown,
      note: `query \u7531\u6807\u9898\u53CD\u63A8\uFF0C\u5C5E\u4E50\u89C2\u4E0A\u754C\uFF1B\u6BCF\u6761\u4EE5\u81EA\u8EAB\u4F5C\u7528\u57DF\u8EAB\u4EFD\u68C0\u7D22\uFF08project:<ws> \u7528 ws\uFF0Cglobal \u501F\u7B2C\u4E00\u4E2A\u8EAB\u4EFD\uFF09\u3002\u547D\u4E2D\u5B9A\u4E49\uFF1A\u76EE\u6807\u6761\u76EE\u51FA\u73B0\u5728 top-K\u3002`,
      rows
    };
    if (options.json !== void 0 && options.json !== null) {
      await mkdir5(dirname5(resolve4(options.json)), { recursive: true });
      await writeFile4(resolve4(options.json), `${JSON.stringify(report, null, 2)}
`, "utf8");
    }
    if (options.markdown !== void 0 && options.markdown !== null) {
      const lines = [
        `# Golden set \u57FA\u7EBF\uFF08${report.generatedAt.slice(0, 10)}\uFF09`,
        "",
        `- hub: \`${root}\` \xB7 golden \u6761\u76EE ${report.goldenCount}\uFF08\u8DF3\u8FC7 ${report.skipped}\uFF09\xB7 K=${options.k} \xB7 memory-hub@${PACKAGE_VERSION}`,
        `- **hit@1 = ${report.hitAt1}/${report.goldenCount}\uFF08${(report.hitAt1Rate * 100).toFixed(1)}%\uFF09** \xB7 hit@${options.k} = ${report.hitAtK}/${report.goldenCount}\uFF08${(report.hitAtKRate * 100).toFixed(1)}%\uFF09`,
        ...identitiesBreakdown.map(
          (identity) => `  - \u8EAB\u4EFD ${identity.identity}\uFF1A${identity.hitAt1}/${identity.rows} @1 \xB7 ${identity.hitAtK}/${identity.rows} @${options.k}`
        ),
        "",
        "| \u5F15\u7528 | ID | \u8EAB\u4EFD | hit | \u6807\u9898 |",
        "| ---: | --- | --- | --- | --- |",
        ...rows.map((row) => `| ${row.citations} | ${row.knowledgeId} | ${row.identity} | ${row.hit === null ? "\u2717" : row.hit} | ${row.title.replace(/\|/g, "/")} |`),
        "",
        "> query \u7531\u6807\u9898\u53CD\u63A8\uFF08\u4E50\u89C2\u4E0A\u754C\uFF09\u3002\u6539\u68C0\u7D22\u524D\u540E\u5404\u8DD1\u4E00\u6B21\u5BF9\u6BD4\uFF1Bgolden \u96C6\u4EBA\u5DE5\u5316\u540E\u6B64\u4E0A\u754C\u4F1A\u4E0B\u4FEE\u3002"
      ];
      await mkdir5(dirname5(resolve4(options.markdown)), { recursive: true });
      await writeFile4(resolve4(options.markdown), `${lines.join("\n")}
`, "utf8");
    }
    return report;
  } finally {
    for (const handle of handles.values()) await handle.dispose();
  }
}

// src/cli.ts
var HELP = `memory-hub \u2014 local-first, file-native long-term memory hub (v${PACKAGE_VERSION})

Usage:
  memory-hub mcp [--root <dir>]            Start the MCP stdio server (Claude Code / opencode / Cline / any MCP client)
  memory-hub serve [--root <dir>] [--port N] [--stop]
                                           Start the standalone panel server (default port 7331, loopback only);
                                           --stop signals the pid recorded in records/server.json
  memory-hub status [--root <dir>] [--json] Read-only hub health check
  memory-hub search <query> [--root <dir>] [--limit N] [--type T]... [--json]
                                           Read-only retrieval over accepted knowledge (same engine as memory_search)
  memory-hub get <id> [--root <dir>] [--json]
                                           Read one knowledge entry by id (title/metadata/body)
  memory-hub inbox [--root <dir>] [--batch <id>] [--json]
                                           List pending proposals awaiting human approval
  memory-hub eval-golden --root <dir> [--top 20] [--k 5] [--json out] [--markdown out]
                                           Golden set baseline: cite-count-ranked entries vs top-K retrieval (read-only)
  memory-hub --version                      Print the version
  memory-hub --help                         Show this help

Root resolution: --root wins; otherwise the fallback hub ~/.dsh/memory-hub.
Point --root at a core hub root to serve that hub's knowledge.
Write paths stay out of the CLI on purpose: humans approve in the panel.
`;
function parseArgs(argv) {
  const options = { json: false, stop: false, top: 20, k: 5, types: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      index += 1;
      options.root = argv[index];
    } else if (arg === "--json") {
      const next = argv[index + 1];
      if (next !== void 0 && next.endsWith(".json")) {
        options.jsonOut = next;
        index += 1;
      } else {
        options.json = true;
      }
    } else if (arg === "--markdown") {
      index += 1;
      options.markdownOut = argv[index];
    } else if (arg === "--port") {
      index += 1;
      const raw = Number(argv[index]);
      options.port = Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : void 0;
    } else if (arg === "--top") {
      index += 1;
      const raw = Number(argv[index]);
      options.top = Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 20;
    } else if (arg === "--k") {
      index += 1;
      const raw = Number(argv[index]);
      options.k = Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 5;
    } else if (arg === "--limit") {
      index += 1;
      const raw = Number(argv[index]);
      options.limit = Number.isFinite(raw) && raw >= 1 ? Math.min(20, Math.trunc(raw)) : void 0;
    } else if (arg === "--type") {
      index += 1;
      const value = argv[index];
      if (value !== void 0) options.types.push(value);
    } else if (arg === "--batch") {
      index += 1;
      const value = argv[index];
      if (value !== void 0) options.batch = value;
    } else if (arg === "--stop") {
      options.stop = true;
    }
  }
  return options;
}
function positional(argv) {
  const valueFlags = /* @__PURE__ */ new Set(["--root", "--markdown", "--port", "--top", "--k", "--limit", "--type", "--batch"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === void 0) continue;
    if (arg.startsWith("--")) {
      if (valueFlags.has(arg)) index += 1;
      continue;
    }
    if (arg !== "") return arg;
  }
  return void 0;
}
function defaultRoot() {
  return join13(homedir3(), ".dsh", "memory-hub");
}
async function runCli(argv, io) {
  const command = argv[0];
  if (command === void 0 || command === "--help" || command === "-h" || command === "help") {
    io.out(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    io.out(`${PACKAGE_VERSION}
`);
    return 0;
  }
  const options = parseArgs(argv.slice(1));
  const root = options.root ?? defaultRoot();
  if (command === "mcp") {
    const handle = await openMemoryHubForTransport({ root });
    try {
      await runMcpStdio(handle, {
        serverInfo: { name: "memory-hub", version: PACKAGE_VERSION },
        tools: createMemoryToolCatalog(handle)
      });
    } finally {
      await handle.dispose();
    }
    return 0;
  }
  if (command === "serve") {
    if (options.stop) {
      const result = await stopServeServer(root);
      io.out(`${result.stopped ? "stopped" : "not-stopped"}${result.pid === void 0 ? "" : ` (pid ${result.pid})`}${result.message === void 0 ? "" : `: ${result.message}`}
`);
      return result.stopped ? 0 : 1;
    }
    const serveHandle = await startServeServer({ root, port: options.port });
    io.out(`memory-hub serve: ${serveHandle.url}
`);
    io.out("write token: records/server-token (POSTs need the x-dmh-token header)\n");
    io.out("press Ctrl+C to stop\n");
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      void serveHandle.close().finally(() => {
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    await new Promise(() => {
    });
  }
  if (command === "search") {
    const query = positional(argv.slice(1));
    if (query === void 0) {
      io.err("usage: memory-hub search <query> [--root <dir>] [--limit N] [--type T] [--json]\n");
      return 2;
    }
    const handle = await openMemoryHubForTransport({ root });
    try {
      const result = await handle.service.search(handle.agent, {
        query,
        ...options.limit === void 0 ? {} : { limit: options.limit },
        ...options.types.length === 0 ? {} : { types: options.types }
      });
      if (options.json) {
        io.out(`${JSON.stringify({ query, total: result.total, hits: result.hits }, null, 2)}
`);
        return 0;
      }
      io.out(`${result.total} hit(s) for "${query}"
`);
      result.hits.forEach((hit, index) => {
        io.out(`${index + 1}. ${hit.id} (v${hit.version}, score ${hit.score.toFixed(3)}) ${hit.title}
`);
        io.out(`   ${hit.scope.level === "project" ? `project:${hit.scope.workspaceId}` : hit.scope.level} \xB7 ${hit.type}/${hit.status}
`);
        io.out(`   ${hit.snippet.replace(/\s+/g, " ").slice(0, 160)}
`);
      });
      return 0;
    } finally {
      await handle.dispose();
    }
  }
  if (command === "get") {
    const id = positional(argv.slice(1));
    if (id === void 0) {
      io.err("usage: memory-hub get <id> [--root <dir>] [--json]\n");
      return 2;
    }
    const handle = await openMemoryHubForTransport({ root });
    try {
      const detail = handle.service.knowledgeDetail(id);
      if (detail === null) {
        io.err(`not found: ${id}
`);
        return 1;
      }
      if (options.json) {
        io.out(`${JSON.stringify(detail, null, 2)}
`);
        return 0;
      }
      const metadata = detail.metadata;
      io.out(`${metadata.title ?? id}
`);
      io.out(`${id} \xB7 v${metadata.version ?? "?"} \xB7 ${metadata.type ?? "?"}/${metadata.status ?? "?"} \xB7 ${metadata.scope ?? "?"} \xB7 updated ${metadata.updatedAt ?? "?"}
`);
      io.out(`${detail.path}

`);
      io.out(`${detail.body}
`);
      return 0;
    } finally {
      await handle.dispose();
    }
  }
  if (command === "inbox") {
    const handle = await openMemoryHubForTransport({ root });
    try {
      const overview = handle.service.overview();
      const pending = options.batch === void 0 ? overview.pending : overview.pending.filter((item) => item.batch === options.batch);
      if (options.json) {
        io.out(`${JSON.stringify({ pendingTotal: overview.pendingTotal, batches: overview.pendingBatches, pending }, null, 2)}
`);
        return 0;
      }
      io.out(`pending ${pending.length}/${overview.pendingTotal}`);
      if (overview.pendingBatches.length > 0) {
        io.out(` \xB7 batches: ${overview.pendingBatches.map((entry) => `${entry.batch}(${entry.count})`).join(", ")}`);
      }
      io.out("\n");
      pending.forEach((item, index) => {
        io.out(`${index + 1}. ${item.id} [${item.operation}/${item.type}] ${item.title}
`);
        io.out(`   ${item.scope}${item.batch === null ? "" : ` \xB7 batch:${item.batch}`} \xB7 risk ${item.risk?.level ?? "none"} \xB7 ${item.createdAt}
`);
      });
      return 0;
    } finally {
      await handle.dispose();
    }
  }
  if (command === "eval-golden") {
    const report = await runGoldenSet({ root, top: options.top, k: options.k, json: options.jsonOut ?? null, markdown: options.markdownOut ?? null });
    io.out(`golden ${report.goldenCount} (skipped ${report.skipped}) \xB7 K=${report.k}
`);
    io.out(`hit@1 = ${report.hitAt1}/${report.goldenCount} (${(report.hitAt1Rate * 100).toFixed(1)}%)
`);
    io.out(`hit@${report.k} = ${report.hitAtK}/${report.goldenCount} (${(report.hitAtKRate * 100).toFixed(1)}%)
`);
    for (const row of report.rows.slice(0, 10)) {
      io.out(`  ${row.hit === null ? "\u2717" : String(row.hit)}  ${row.knowledgeId}  (cited ${row.citations})  ${row.title}
`);
    }
    return 0;
  }
  if (command === "status") {
    const handle = await openMemoryHubForTransport({ root });
    try {
      const status = handle.service.status(handle.agent);
      io.out(`${JSON.stringify(status, null, options.json ? 0 : 2)}
`);
    } finally {
      await handle.dispose();
    }
    return 0;
  }
  io.err(`unknown command: ${command}

${HELP}`);
  return 2;
}
async function main() {
  const io = { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) };
  return runCli(process.argv.slice(2), io);
}
main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write(`memory-hub: ${error.message}
`);
  process.exitCode = 1;
});
export {
  runCli
};
