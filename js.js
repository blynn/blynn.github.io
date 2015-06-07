// This object will hold all exports.
var Haste = {};

/* Thunk
   Creates a thunk representing the given closure.
   Since we want automatic memoization of as many expressions as possible, we
   use a JS object as a sort of tagged pointer, where the member x denotes the
   object actually pointed to. If a "pointer" points to a thunk, it has a
   member 't' which is set to true; if it points to a value, be it a function,
   a value of an algebraic type of a primitive value, it has no member 't'.
*/

function T(f) {
    this.f = new F(f);
}

function F(f) {
    this.f = f;
}

/* Apply
   Applies the function f to the arguments args. If the application is under-
   saturated, a closure is returned, awaiting further arguments. If it is over-
   saturated, the function is fully applied, and the result (assumed to be a
   function) is then applied to the remaining arguments.
*/
function A(f, args) {
    if(f instanceof T) {
        f = E(f);
    }
    // Closure does some funny stuff with functions that occasionally
    // results in non-functions getting applied, so we have to deal with
    // it.
    if(!(f instanceof Function)) {
        return f;
    }

    if(f.arity === undefined) {
        f.arity = f.length;
    }
    if(args.length === f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return f(args[0]);
            default: return f.apply(null, args);
        }
    } else if(args.length > f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return A(f(args.shift()), args);
            default: return A(f.apply(null, args.splice(0, f.arity)), args);
        }
    } else {
        var g = function() {
            return A(f, args.concat(Array.prototype.slice.call(arguments)));
        };
        g.arity = f.arity - args.length;
        return g;
    }
}

/* Eval
   Evaluate the given thunk t into head normal form.
   If the "thunk" we get isn't actually a thunk, just return it.
*/
function E(t) {
    if(t instanceof T) {
        if(t.f instanceof F) {
            return t.f = t.f.f();
        } else {
            return t.f;
        }
    } else {
        return t;
    }
}

// Export Haste, A and E. Haste because we need to preserve exports, A and E
// because they're handy for Haste.Foreign.
if(!window) {
    var window = {};
}
window['Haste'] = Haste;
window['A'] = A;
window['E'] = E;


/* Throw an error.
   We need to be able to use throw as an exception so we wrap it in a function.
*/
function die(err) {
    throw err;
}

function quot(a, b) {
    return (a-a%b)/b;
}

function quotRemI(a, b) {
    return [0, (a-a%b)/b, a%b];
}

// 32 bit integer multiplication, with correct overflow behavior
// note that |0 or >>>0 needs to be applied to the result, for int and word
// respectively.
function imul(a, b) {
  // ignore high a * high a as the result will always be truncated
  var lows = (a & 0xffff) * (b & 0xffff); // low a * low b
  var aB = (a & 0xffff) * (b & 0xffff0000); // low a * high b
  var bA = (a & 0xffff0000) * (b & 0xffff); // low b * high a
  return lows + aB + bA; // sum will not exceed 52 bits, so it's safe
}

function addC(a, b) {
    var x = a+b;
    return [0, x & 0xffffffff, x > 0x7fffffff];
}

function subC(a, b) {
    var x = a-b;
    return [0, x & 0xffffffff, x < -2147483648];
}

function sinh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / 2;
}

function tanh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / (Math.exp(arg) + Math.exp(-arg));
}

function cosh (arg) {
    return (Math.exp(arg) + Math.exp(-arg)) / 2;
}

// Scratch space for byte arrays.
var rts_scratchBuf = new ArrayBuffer(8);
var rts_scratchW32 = new Uint32Array(rts_scratchBuf);
var rts_scratchFloat = new Float32Array(rts_scratchBuf);
var rts_scratchDouble = new Float64Array(rts_scratchBuf);

function decodeFloat(x) {
    rts_scratchFloat[0] = x;
    var sign = x < 0 ? -1 : 1;
    var exp = ((rts_scratchW32[0] >> 23) & 0xff) - 150;
    var man = rts_scratchW32[0] & 0x7fffff;
    if(exp === 0) {
        ++exp;
    } else {
        man |= (1 << 23);
    }
    return [0, sign*man, exp];
}

function decodeDouble(x) {
    rts_scratchDouble[0] = x;
    var sign = x < 0 ? -1 : 1;
    var manHigh = rts_scratchW32[1] & 0xfffff;
    var manLow = rts_scratchW32[0];
    var exp = ((rts_scratchW32[1] >> 20) & 0x7ff) - 1075;
    if(exp === 0) {
        ++exp;
    } else {
        manHigh |= (1 << 20);
    }
    return [0, sign, manHigh, manLow, exp];
}

function isFloatFinite(x) {
    return isFinite(x);
}

function isDoubleFinite(x) {
    return isFinite(x);
}

function err(str) {
    die(toJSStr(str));
}

/* unpackCString#
   NOTE: update constructor tags if the code generator starts munging them.
*/
function unCStr(str) {return unAppCStr(str, [0]);}

function unFoldrCStr(str, f, z) {
    var acc = z;
    for(var i = str.length-1; i >= 0; --i) {
        acc = A(f, [[0, str.charCodeAt(i)], acc]);
    }
    return acc;
}

function unAppCStr(str, chrs) {
    var i = arguments[2] ? arguments[2] : 0;
    if(i >= str.length) {
        return E(chrs);
    } else {
        return [1,[0,str.charCodeAt(i)],new T(function() {
            return unAppCStr(str,chrs,i+1);
        })];
    }
}

function charCodeAt(str, i) {return str.charCodeAt(i);}

function fromJSStr(str) {
    return unCStr(E(str));
}

function toJSStr(hsstr) {
    var s = '';
    for(var str = E(hsstr); str[0] == 1; str = E(str[2])) {
        s += String.fromCharCode(E(str[1])[1]);
    }
    return s;
}

// newMutVar
function nMV(val) {
    return ({x: val});
}

// readMutVar
function rMV(mv) {
    return mv.x;
}

// writeMutVar
function wMV(mv, val) {
    mv.x = val;
}

// atomicModifyMutVar
function mMV(mv, f) {
    var x = A(f, [mv.x]);
    mv.x = x[1];
    return x[2];
}

function localeEncoding() {
    var le = newByteArr(5);
    le['b']['i8'] = 'U'.charCodeAt(0);
    le['b']['i8'] = 'T'.charCodeAt(0);
    le['b']['i8'] = 'F'.charCodeAt(0);
    le['b']['i8'] = '-'.charCodeAt(0);
    le['b']['i8'] = '8'.charCodeAt(0);
    return le;
}

var isDoubleNaN = isNaN;
var isFloatNaN = isNaN;

function isDoubleInfinite(d) {
    return (d === Infinity);
}
var isFloatInfinite = isDoubleInfinite;

function isDoubleNegativeZero(x) {
    return (x===0 && (1/x)===-Infinity);
}
var isFloatNegativeZero = isDoubleNegativeZero;

function strEq(a, b) {
    return a == b;
}

function strOrd(a, b) {
    if(a < b) {
        return [0];
    } else if(a == b) {
        return [1];
    }
    return [2];
}

function jsCatch(act, handler) {
    try {
        return A(act,[0]);
    } catch(e) {
        return A(handler,[e, 0]);
    }
}

var coercionToken = undefined;

/* Haste represents constructors internally using 1 for the first constructor,
   2 for the second, etc.
   However, dataToTag should use 0, 1, 2, etc. Also, booleans might be unboxed.
 */
function dataToTag(x) {
    if(x instanceof Array) {
        return x[0];
    } else {
        return x;
    }
}

function __word_encodeDouble(d, e) {
    return d * Math.pow(2,e);
}

var __word_encodeFloat = __word_encodeDouble;
var jsRound = Math.round; // Stupid GHC doesn't like periods in FFI IDs...
var realWorld = undefined;
if(typeof _ == 'undefined') {
    var _ = undefined;
}

function popCnt(i) {
    i = i - ((i >> 1) & 0x55555555);
    i = (i & 0x33333333) + ((i >> 2) & 0x33333333);
    return (((i + (i >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function jsAlert(val) {
    if(typeof alert != 'undefined') {
        alert(val);
    } else {
        print(val);
    }
}

function jsLog(val) {
    console.log(val);
}

function jsPrompt(str) {
    var val;
    if(typeof prompt != 'undefined') {
        val = prompt(str);
    } else {
        print(str);
        val = readline();
    }
    return val == undefined ? '' : val.toString();
}

function jsEval(str) {
    var x = eval(str);
    return x == undefined ? '' : x.toString();
}

function isNull(obj) {
    return obj === null;
}

function jsRead(str) {
    return Number(str);
}

function jsShowI(val) {return val.toString();}
function jsShow(val) {
    var ret = val.toString();
    return val == Math.round(val) ? ret + '.0' : ret;
}

function jsGetMouseCoords(e) {
    var posx = 0;
    var posy = 0;
    if (!e) var e = window.event;
    if (e.pageX || e.pageY) 	{
	posx = e.pageX;
	posy = e.pageY;
    }
    else if (e.clientX || e.clientY) 	{
	posx = e.clientX + document.body.scrollLeft
	    + document.documentElement.scrollLeft;
	posy = e.clientY + document.body.scrollTop
	    + document.documentElement.scrollTop;
    }
    return [posx - (e.target.offsetLeft || 0),
	    posy - (e.target.offsetTop || 0)];
}

function jsSetCB(elem, evt, cb) {
    // Count return press in single line text box as a change event.
    if(evt == 'change' && elem.type.toLowerCase() == 'text') {
        setCB(elem, 'keyup', function(k) {
            if(k == '\n'.charCodeAt(0)) {
                A(cb,[[0,k.keyCode],0]);
            }
        });
    }

    var fun;
    switch(evt) {
    case 'click':
    case 'dblclick':
    case 'mouseup':
    case 'mousedown':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,x.button],[0,mx,my],0]);
        };
        break;
    case 'mousemove':
    case 'mouseover':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,mx,my],0]);
        };
        break;
    case 'keypress':
    case 'keyup':
    case 'keydown':
        fun = function(x) {A(cb,[[0,x.keyCode],0]);};
        break;        
    default:
        fun = function() {A(cb,[0]);};
        break;
    }
    return setCB(elem, evt, fun);
}

function setCB(elem, evt, cb) {
    if(elem.addEventListener) {
        elem.addEventListener(evt, cb, false);
        return true;
    } else if(elem.attachEvent) {
        elem.attachEvent('on'+evt, cb);
        return true;
    }
    return false;
}

function jsSetTimeout(msecs, cb) {
    window.setTimeout(function() {A(cb,[0]);}, msecs);
}

function jsGet(elem, prop) {
    return elem[prop].toString();
}

function jsSet(elem, prop, val) {
    elem[prop] = val;
}

function jsGetAttr(elem, prop) {
    if(elem.hasAttribute(prop)) {
        return elem.getAttribute(prop).toString();
    } else {
        return "";
    }
}

function jsSetAttr(elem, prop, val) {
    elem.setAttribute(prop, val);
}

function jsGetStyle(elem, prop) {
    return elem.style[prop].toString();
}

function jsSetStyle(elem, prop, val) {
    elem.style[prop] = val;
}

function jsKillChild(child, parent) {
    parent.removeChild(child);
}

function jsClearChildren(elem) {
    while(elem.hasChildNodes()){
        elem.removeChild(elem.lastChild);
    }
}

function jsFind(elem) {
    var e = document.getElementById(elem)
    if(e) {
        return [1,[0,e]];
    }
    return [0];
}

function jsCreateElem(tag) {
    return document.createElement(tag);
}

function jsCreateTextNode(str) {
    return document.createTextNode(str);
}

function jsGetChildBefore(elem) {
    elem = elem.previousSibling;
    while(elem) {
        if(typeof elem.tagName != 'undefined') {
            return [1,[0,elem]];
        }
        elem = elem.previousSibling;
    }
    return [0];
}

function jsGetLastChild(elem) {
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}

function jsGetChildren(elem) {
    var children = [0];
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            children = [1, [0,elem.childNodes[i]], children];
        }
    }
    return children;
}

function jsSetChildren(elem, children) {
    children = E(children);
    jsClearChildren(elem, 0);
    while(children[0] === 1) {
        elem.appendChild(E(E(children[1])[1]));
        children = E(children[2]);
    }
}

function jsAppendChild(child, container) {
    container.appendChild(child);
}

function jsAddChildBefore(child, container, after) {
    container.insertBefore(child, after);
}

var jsRand = Math.random;

// Concatenate a Haskell list of JS strings
function jsCat(strs, sep) {
    var arr = [];
    strs = E(strs);
    while(strs[0]) {
        strs = E(strs);
        arr.push(E(strs[1])[1]);
        strs = E(strs[2]);
    }
    return arr.join(sep);
}

var jsJSONParse = JSON.parse;

// JSON stringify a string
function jsStringify(str) {
    return JSON.stringify(str);
}

// Parse a JSON message into a Haste.JSON.JSON value.
// As this pokes around inside Haskell values, it'll need to be updated if:
// * Haste.JSON.JSON changes;
// * E() starts to choke on non-thunks;
// * data constructor code generation changes; or
// * Just and Nothing change tags.
function jsParseJSON(str) {
    try {
        var js = JSON.parse(str);
        var hs = toHS(js);
    } catch(_) {
        return [0];
    }
    return [1,hs];
}

function toHS(obj) {
    switch(typeof obj) {
    case 'number':
        return [0, [0, jsRead(obj)]];
    case 'string':
        return [1, [0, obj]];
        break;
    case 'boolean':
        return [2, obj]; // Booleans are special wrt constructor tags!
        break;
    case 'object':
        if(obj instanceof Array) {
            return [3, arr2lst_json(obj, 0)];
        } else {
            // Object type but not array - it's a dictionary.
            // The RFC doesn't say anything about the ordering of keys, but
            // considering that lots of people rely on keys being "in order" as
            // defined by "the same way someone put them in at the other end,"
            // it's probably a good idea to put some cycles into meeting their
            // misguided expectations.
            var ks = [];
            for(var k in obj) {
                ks.unshift(k);
            }
            var xs = [0];
            for(var i = 0; i < ks.length; i++) {
                xs = [1, [0, [0,ks[i]], toHS(obj[ks[i]])], xs];
            }
            return [4, xs];
        }
    }
}

function arr2lst_json(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, toHS(arr[elem]), new T(function() {return arr2lst_json(arr,elem+1);})]
}

function arr2lst(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, arr[elem], new T(function() {return arr2lst(arr,elem+1);})]
}

function lst2arr(xs) {
    var arr = [];
    for(; xs[0]; xs = E(xs[2])) {
        arr.push(E(xs[1]));
    }
    return arr;
}

function ajaxReq(method, url, async, postdata, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, async);
    xhr.setRequestHeader('Cache-control', 'no-cache');
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                A(cb,[[1,[0,xhr.responseText]],0]);
            } else {
                A(cb,[[0],0]); // Nothing
            }
        }
    }
    xhr.send(postdata);
}

// Create a little endian ArrayBuffer representation of something.
function toABHost(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    return a;
}

function toABSwap(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    var bs = new Uint8Array(a);
    for(var i = 0, j = n-1; i < j; ++i, --j) {
        var tmp = bs[i];
        bs[i] = bs[j];
        bs[j] = tmp;
    }
    return a;
}

window['toABle'] = toABHost;
window['toABbe'] = toABSwap;

// Swap byte order if host is not little endian.
var buffer = new ArrayBuffer(2);
new DataView(buffer).setInt16(0, 256, true);
if(new Int16Array(buffer)[0] !== 256) {
    window['toABle'] = toABSwap;
    window['toABbe'] = toABHost;
}

// MVar implementation.
// Since Haste isn't concurrent, takeMVar and putMVar don't block on empty
// and full MVars respectively, but terminate the program since they would
// otherwise be blocking forever.

function newMVar() {
    return ({empty: true});
}

function tryTakeMVar(mv) {
    if(mv.empty) {
        return [0, 0, undefined];
    } else {
        var val = mv.x;
        mv.empty = true;
        mv.x = null;
        return [0, 1, val];
    }
}

function takeMVar(mv) {
    if(mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to take empty MVar!");
    }
    var val = mv.x;
    mv.empty = true;
    mv.x = null;
    return val;
}

function putMVar(mv, val) {
    if(!mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to put full MVar!");
    }
    mv.empty = false;
    mv.x = val;
}

function tryPutMVar(mv, val) {
    if(!mv.empty) {
        return 0;
    } else {
        mv.empty = false;
        mv.x = val;
        return 1;
    }
}

function sameMVar(a, b) {
    return (a == b);
}

function isEmptyMVar(mv) {
    return mv.empty ? 1 : 0;
}

// Implementation of stable names.
// Unlike native GHC, the garbage collector isn't going to move data around
// in a way that we can detect, so each object could serve as its own stable
// name if it weren't for the fact we can't turn a JS reference into an
// integer.
// So instead, each object has a unique integer attached to it, which serves
// as its stable name.

var __next_stable_name = 1;

function makeStableName(x) {
    if(!x.stableName) {
        x.stableName = __next_stable_name;
        __next_stable_name += 1;
    }
    return x.stableName;
}

function eqStableName(x, y) {
    return (x == y) ? 1 : 0;
}

var Integer = function(bits, sign) {
  this.bits_ = [];
  this.sign_ = sign;

  var top = true;
  for (var i = bits.length - 1; i >= 0; i--) {
    var val = bits[i] | 0;
    if (!top || val != sign) {
      this.bits_[i] = val;
      top = false;
    }
  }
};

Integer.IntCache_ = {};

var I_fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Integer.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Integer([value | 0], value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Integer.IntCache_[value] = obj;
  }
  return obj;
};

var I_fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Integer.ZERO;
  } else if (value < 0) {
    return I_negate(I_fromNumber(-value));
  } else {
    var bits = [];
    var pow = 1;
    for (var i = 0; value >= pow; i++) {
      bits[i] = (value / pow) | 0;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return new Integer(bits, 0);
  }
};

var I_fromBits = function(bits) {
  var high = bits[bits.length - 1];
  return new Integer(bits, high & (1 << 31) ? -1 : 0);
};

var I_fromString = function(str, opt_radix) {
  if (str.length == 0) {
    throw Error('number format error: empty string');
  }

  var radix = opt_radix || 10;
  if (radix < 2 || 36 < radix) {
    throw Error('radix out of range: ' + radix);
  }

  if (str.charAt(0) == '-') {
    return I_negate(I_fromString(str.substring(1), radix));
  } else if (str.indexOf('-') >= 0) {
    throw Error('number format error: interior "-" character');
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 8));

  var result = Integer.ZERO;
  for (var i = 0; i < str.length; i += 8) {
    var size = Math.min(8, str.length - i);
    var value = parseInt(str.substring(i, i + size), radix);
    if (size < 8) {
      var power = I_fromNumber(Math.pow(radix, size));
      result = I_add(I_mul(result, power), I_fromNumber(value));
    } else {
      result = I_mul(result, radixToPower);
      result = I_add(result, I_fromNumber(value));
    }
  }
  return result;
};


Integer.TWO_PWR_32_DBL_ = (1 << 16) * (1 << 16);
Integer.ZERO = I_fromInt(0);
Integer.ONE = I_fromInt(1);
Integer.TWO_PWR_24_ = I_fromInt(1 << 24);

var I_toInt = function(self) {
  return self.bits_.length > 0 ? self.bits_[0] : self.sign_;
};

var I_toWord = function(self) {
  return I_toInt(self) >>> 0;
};

var I_toNumber = function(self) {
  if (isNegative(self)) {
    return -I_toNumber(I_negate(self));
  } else {
    var val = 0;
    var pow = 1;
    for (var i = 0; i < self.bits_.length; i++) {
      val += I_getBitsUnsigned(self, i) * pow;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return val;
  }
};

var I_getBits = function(self, index) {
  if (index < 0) {
    return 0;
  } else if (index < self.bits_.length) {
    return self.bits_[index];
  } else {
    return self.sign_;
  }
};

var I_getBitsUnsigned = function(self, index) {
  var val = I_getBits(self, index);
  return val >= 0 ? val : Integer.TWO_PWR_32_DBL_ + val;
};

var getSign = function(self) {
  return self.sign_;
};

var isZero = function(self) {
  if (self.sign_ != 0) {
    return false;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    if (self.bits_[i] != 0) {
      return false;
    }
  }
  return true;
};

var isNegative = function(self) {
  return self.sign_ == -1;
};

var isOdd = function(self) {
  return (self.bits_.length == 0) && (self.sign_ == -1) ||
         (self.bits_.length > 0) && ((self.bits_[0] & 1) != 0);
};

var I_equals = function(self, other) {
  if (self.sign_ != other.sign_) {
    return false;
  }
  var len = Math.max(self.bits_.length, other.bits_.length);
  for (var i = 0; i < len; i++) {
    if (I_getBits(self, i) != I_getBits(other, i)) {
      return false;
    }
  }
  return true;
};

var I_notEquals = function(self, other) {
  return !I_equals(self, other);
};

var I_greaterThan = function(self, other) {
  return I_compare(self, other) > 0;
};

var I_greaterThanOrEqual = function(self, other) {
  return I_compare(self, other) >= 0;
};

var I_lessThan = function(self, other) {
  return I_compare(self, other) < 0;
};

var I_lessThanOrEqual = function(self, other) {
  return I_compare(self, other) <= 0;
};

var I_compare = function(self, other) {
  var diff = I_sub(self, other);
  if (isNegative(diff)) {
    return -1;
  } else if (isZero(diff)) {
    return 0;
  } else {
    return +1;
  }
};

var I_compareInt = function(self, other) {
  return I_compare(self, I_fromInt(other));
}

var shorten = function(self, numBits) {
  var arr_index = (numBits - 1) >> 5;
  var bit_index = (numBits - 1) % 32;
  var bits = [];
  for (var i = 0; i < arr_index; i++) {
    bits[i] = I_getBits(self, i);
  }
  var sigBits = bit_index == 31 ? 0xFFFFFFFF : (1 << (bit_index + 1)) - 1;
  var val = I_getBits(self, arr_index) & sigBits;
  if (val & (1 << bit_index)) {
    val |= 0xFFFFFFFF - sigBits;
    bits[arr_index] = val;
    return new Integer(bits, -1);
  } else {
    bits[arr_index] = val;
    return new Integer(bits, 0);
  }
};

var I_negate = function(self) {
  return I_add(not(self), Integer.ONE);
};

var I_add = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  var carry = 0;

  for (var i = 0; i <= len; i++) {
    var a1 = I_getBits(self, i) >>> 16;
    var a0 = I_getBits(self, i) & 0xFFFF;

    var b1 = I_getBits(other, i) >>> 16;
    var b0 = I_getBits(other, i) & 0xFFFF;

    var c0 = carry + a0 + b0;
    var c1 = (c0 >>> 16) + a1 + b1;
    carry = c1 >>> 16;
    c0 &= 0xFFFF;
    c1 &= 0xFFFF;
    arr[i] = (c1 << 16) | c0;
  }
  return I_fromBits(arr);
};

var I_sub = function(self, other) {
  return I_add(self, I_negate(other));
};

var I_mul = function(self, other) {
  if (isZero(self)) {
    return Integer.ZERO;
  } else if (isZero(other)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_mul(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_mul(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_mul(self, I_negate(other)));
  }

  if (I_lessThan(self, Integer.TWO_PWR_24_) &&
      I_lessThan(other, Integer.TWO_PWR_24_)) {
    return I_fromNumber(I_toNumber(self) * I_toNumber(other));
  }

  var len = self.bits_.length + other.bits_.length;
  var arr = [];
  for (var i = 0; i < 2 * len; i++) {
    arr[i] = 0;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    for (var j = 0; j < other.bits_.length; j++) {
      var a1 = I_getBits(self, i) >>> 16;
      var a0 = I_getBits(self, i) & 0xFFFF;

      var b1 = I_getBits(other, j) >>> 16;
      var b0 = I_getBits(other, j) & 0xFFFF;

      arr[2 * i + 2 * j] += a0 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j);
      arr[2 * i + 2 * j + 1] += a1 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 1] += a0 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 2] += a1 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 2);
    }
  }

  for (var i = 0; i < len; i++) {
    arr[i] = (arr[2 * i + 1] << 16) | arr[2 * i];
  }
  for (var i = len; i < 2 * len; i++) {
    arr[i] = 0;
  }
  return new Integer(arr, 0);
};

Integer.carry16_ = function(bits, index) {
  while ((bits[index] & 0xFFFF) != bits[index]) {
    bits[index + 1] += bits[index] >>> 16;
    bits[index] &= 0xFFFF;
  }
};

var I_mod = function(self, other) {
  return I_rem(I_add(other, I_rem(self, other)), other);
}

var I_div = function(self, other) {
  if(I_greaterThan(self, Integer.ZERO) != I_greaterThan(other, Integer.ZERO)) {
    if(I_rem(self, other) != Integer.ZERO) {
      return I_sub(I_quot(self, other), Integer.ONE);
    }
  }
  return I_quot(self, other);
}

var I_quotRem = function(self, other) {
  return [0, I_quot(self, other), I_rem(self, other)];
}

var I_divMod = function(self, other) {
  return [0, I_div(self, other), I_mod(self, other)];
}

var I_quot = function(self, other) {
  if (isZero(other)) {
    throw Error('division by zero');
  } else if (isZero(self)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_quot(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_quot(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_quot(self, I_negate(other)));
  }

  var res = Integer.ZERO;
  var rem = self;
  while (I_greaterThanOrEqual(rem, other)) {
    var approx = Math.max(1, Math.floor(I_toNumber(rem) / I_toNumber(other)));
    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);
    var approxRes = I_fromNumber(approx);
    var approxRem = I_mul(approxRes, other);
    while (isNegative(approxRem) || I_greaterThan(approxRem, rem)) {
      approx -= delta;
      approxRes = I_fromNumber(approx);
      approxRem = I_mul(approxRes, other);
    }

    if (isZero(approxRes)) {
      approxRes = Integer.ONE;
    }

    res = I_add(res, approxRes);
    rem = I_sub(rem, approxRem);
  }
  return res;
};

var I_rem = function(self, other) {
  return I_sub(self, I_mul(I_quot(self, other), other));
};

var not = function(self) {
  var len = self.bits_.length;
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = ~self.bits_[i];
  }
  return new Integer(arr, ~self.sign_);
};

var I_and = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) & I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ & other.sign_);
};

var I_or = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) | I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ | other.sign_);
};

var I_xor = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) ^ I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ ^ other.sign_);
};

var I_shiftLeft = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length + arr_delta + (bit_delta > 0 ? 1 : 0);
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i - arr_delta) << bit_delta) |
               (I_getBits(self, i - arr_delta - 1) >>> (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i - arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_shiftRight = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length - arr_delta;
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i + arr_delta) >>> bit_delta) |
               (I_getBits(self, i + arr_delta + 1) << (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i + arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_signum = function(self) {
  var cmp = I_compare(self, Integer.ZERO);
  if(cmp > 0) {
    return Integer.ONE
  }
  if(cmp < 0) {
    return I_sub(Integer.ZERO, Integer.ONE);
  }
  return Integer.ZERO;
};

var I_abs = function(self) {
  if(I_compare(self, Integer.ZERO) < 0) {
    return I_sub(Integer.ZERO, self);
  }
  return self;
};

var I_decodeDouble = function(x) {
  var dec = decodeDouble(x);
  var mantissa = I_fromBits([dec[3], dec[2]]);
  if(dec[1] < 0) {
    mantissa = I_negate(mantissa);
  }
  return [0, dec[4], mantissa];
}

var I_toString = function(self) {
  var radix = 10;

  if (isZero(self)) {
    return '0';
  } else if (isNegative(self)) {
    return '-' + I_toString(I_negate(self));
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 6));

  var rem = self;
  var result = '';
  while (true) {
    var remDiv = I_div(rem, radixToPower);
    var intval = I_toInt(I_sub(rem, I_mul(remDiv, radixToPower)));
    var digits = intval.toString();

    rem = remDiv;
    if (isZero(rem)) {
      return digits + result;
    } else {
      while (digits.length < 6) {
        digits = '0' + digits;
      }
      result = '' + digits + result;
    }
  }
};

var I_fromRat = function(a, b) {
    return I_toNumber(a) / I_toNumber(b);
}

function I_fromInt64(x) {
    return I_fromBits([x.getLowBits(), x.getHighBits()]);
}

function I_toInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

function I_fromWord64(x) {
    return x;
}

function I_toWord64(x) {
    return I_rem(I_add(__w64_max, x), __w64_max);
}

// Copyright 2009 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var Long = function(low, high) {
  this.low_ = low | 0;
  this.high_ = high | 0;
};

Long.IntCache_ = {};

Long.fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Long.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Long(value | 0, value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Long.IntCache_[value] = obj;
  }
  return obj;
};

Long.fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Long.ZERO;
  } else if (value <= -Long.TWO_PWR_63_DBL_) {
    return Long.MIN_VALUE;
  } else if (value + 1 >= Long.TWO_PWR_63_DBL_) {
    return Long.MAX_VALUE;
  } else if (value < 0) {
    return Long.fromNumber(-value).negate();
  } else {
    return new Long(
        (value % Long.TWO_PWR_32_DBL_) | 0,
        (value / Long.TWO_PWR_32_DBL_) | 0);
  }
};

Long.fromBits = function(lowBits, highBits) {
  return new Long(lowBits, highBits);
};

Long.TWO_PWR_16_DBL_ = 1 << 16;
Long.TWO_PWR_24_DBL_ = 1 << 24;
Long.TWO_PWR_32_DBL_ =
    Long.TWO_PWR_16_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_31_DBL_ =
    Long.TWO_PWR_32_DBL_ / 2;
Long.TWO_PWR_48_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_64_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_32_DBL_;
Long.TWO_PWR_63_DBL_ =
    Long.TWO_PWR_64_DBL_ / 2;
Long.ZERO = Long.fromInt(0);
Long.ONE = Long.fromInt(1);
Long.NEG_ONE = Long.fromInt(-1);
Long.MAX_VALUE =
    Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long.MIN_VALUE = Long.fromBits(0, 0x80000000 | 0);
Long.TWO_PWR_24_ = Long.fromInt(1 << 24);

Long.prototype.toInt = function() {
  return this.low_;
};

Long.prototype.toNumber = function() {
  return this.high_ * Long.TWO_PWR_32_DBL_ +
         this.getLowBitsUnsigned();
};

Long.prototype.getHighBits = function() {
  return this.high_;
};

Long.prototype.getLowBits = function() {
  return this.low_;
};

Long.prototype.getLowBitsUnsigned = function() {
  return (this.low_ >= 0) ?
      this.low_ : Long.TWO_PWR_32_DBL_ + this.low_;
};

Long.prototype.isZero = function() {
  return this.high_ == 0 && this.low_ == 0;
};

Long.prototype.isNegative = function() {
  return this.high_ < 0;
};

Long.prototype.isOdd = function() {
  return (this.low_ & 1) == 1;
};

Long.prototype.equals = function(other) {
  return (this.high_ == other.high_) && (this.low_ == other.low_);
};

Long.prototype.notEquals = function(other) {
  return (this.high_ != other.high_) || (this.low_ != other.low_);
};

Long.prototype.lessThan = function(other) {
  return this.compare(other) < 0;
};

Long.prototype.lessThanOrEqual = function(other) {
  return this.compare(other) <= 0;
};

Long.prototype.greaterThan = function(other) {
  return this.compare(other) > 0;
};

Long.prototype.greaterThanOrEqual = function(other) {
  return this.compare(other) >= 0;
};

Long.prototype.compare = function(other) {
  if (this.equals(other)) {
    return 0;
  }

  var thisNeg = this.isNegative();
  var otherNeg = other.isNegative();
  if (thisNeg && !otherNeg) {
    return -1;
  }
  if (!thisNeg && otherNeg) {
    return 1;
  }

  if (this.subtract(other).isNegative()) {
    return -1;
  } else {
    return 1;
  }
};

Long.prototype.negate = function() {
  if (this.equals(Long.MIN_VALUE)) {
    return Long.MIN_VALUE;
  } else {
    return this.not().add(Long.ONE);
  }
};

Long.prototype.add = function(other) {
  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 + b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 + b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 + b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 + b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.subtract = function(other) {
  return this.add(other.negate());
};

Long.prototype.multiply = function(other) {
  if (this.isZero()) {
    return Long.ZERO;
  } else if (other.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  } else if (other.equals(Long.MIN_VALUE)) {
    return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().multiply(other.negate());
    } else {
      return this.negate().multiply(other).negate();
    }
  } else if (other.isNegative()) {
    return this.multiply(other.negate()).negate();
  }

  if (this.lessThan(Long.TWO_PWR_24_) &&
      other.lessThan(Long.TWO_PWR_24_)) {
    return Long.fromNumber(this.toNumber() * other.toNumber());
  }

  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 * b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 * b00;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c16 += a00 * b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 * b00;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a16 * b16;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a00 * b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.div = function(other) {
  if (other.isZero()) {
    throw Error('division by zero');
  } else if (this.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    if (other.equals(Long.ONE) ||
        other.equals(Long.NEG_ONE)) {
      return Long.MIN_VALUE;
    } else if (other.equals(Long.MIN_VALUE)) {
      return Long.ONE;
    } else {
      var halfThis = this.shiftRight(1);
      var approx = halfThis.div(other).shiftLeft(1);
      if (approx.equals(Long.ZERO)) {
        return other.isNegative() ? Long.ONE : Long.NEG_ONE;
      } else {
        var rem = this.subtract(other.multiply(approx));
        var result = approx.add(rem.div(other));
        return result;
      }
    }
  } else if (other.equals(Long.MIN_VALUE)) {
    return Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().div(other.negate());
    } else {
      return this.negate().div(other).negate();
    }
  } else if (other.isNegative()) {
    return this.div(other.negate()).negate();
  }

  var res = Long.ZERO;
  var rem = this;
  while (rem.greaterThanOrEqual(other)) {
    var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

    var approxRes = Long.fromNumber(approx);
    var approxRem = approxRes.multiply(other);
    while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
      approx -= delta;
      approxRes = Long.fromNumber(approx);
      approxRem = approxRes.multiply(other);
    }

    if (approxRes.isZero()) {
      approxRes = Long.ONE;
    }

    res = res.add(approxRes);
    rem = rem.subtract(approxRem);
  }
  return res;
};

Long.prototype.modulo = function(other) {
  return this.subtract(this.div(other).multiply(other));
};

Long.prototype.not = function() {
  return Long.fromBits(~this.low_, ~this.high_);
};

Long.prototype.and = function(other) {
  return Long.fromBits(this.low_ & other.low_,
                                 this.high_ & other.high_);
};

Long.prototype.or = function(other) {
  return Long.fromBits(this.low_ | other.low_,
                                 this.high_ | other.high_);
};

Long.prototype.xor = function(other) {
  return Long.fromBits(this.low_ ^ other.low_,
                                 this.high_ ^ other.high_);
};

Long.prototype.shiftLeft = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var low = this.low_;
    if (numBits < 32) {
      var high = this.high_;
      return Long.fromBits(
          low << numBits,
          (high << numBits) | (low >>> (32 - numBits)));
    } else {
      return Long.fromBits(0, low << (numBits - 32));
    }
  }
};

Long.prototype.shiftRight = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >> numBits);
    } else {
      return Long.fromBits(
          high >> (numBits - 32),
          high >= 0 ? 0 : -1);
    }
  }
};

Long.prototype.shiftRightUnsigned = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >>> numBits);
    } else if (numBits == 32) {
      return Long.fromBits(high, 0);
    } else {
      return Long.fromBits(high >>> (numBits - 32), 0);
    }
  }
};



// Int64
function hs_eqInt64(x, y) {return x.equals(y);}
function hs_neInt64(x, y) {return !x.equals(y);}
function hs_ltInt64(x, y) {return x.compare(y) < 0;}
function hs_leInt64(x, y) {return x.compare(y) <= 0;}
function hs_gtInt64(x, y) {return x.compare(y) > 0;}
function hs_geInt64(x, y) {return x.compare(y) >= 0;}
function hs_quotInt64(x, y) {return x.div(y);}
function hs_remInt64(x, y) {return x.modulo(y);}
function hs_plusInt64(x, y) {return x.add(y);}
function hs_minusInt64(x, y) {return x.subtract(y);}
function hs_timesInt64(x, y) {return x.multiply(y);}
function hs_negateInt64(x) {return x.negate();}
function hs_uncheckedIShiftL64(x, bits) {x.shiftLeft(bits);}
function hs_uncheckedIShiftRA64(x, bits) {x.shiftRight(bits);}
function hs_uncheckedIShiftRL64(x, bits) {x.shiftRightUnsigned(bits);}
function hs_intToInt64(x) {return new Long(x, 0);}
function hs_int64ToInt(x) {return x.toInt();}



// Word64
function hs_wordToWord64(x) {
    return I_fromInt(x);
}
function hs_word64ToWord(x) {
    return I_toInt(x);
}
function hs_mkWord64(low, high) {
    return I_fromBits([low, high]);
}

var hs_and64 = I_and;
var hs_or64 = I_or;
var hs_xor64 = I_xor;
var __i64_all_ones = I_fromBits([0xffffffff, 0xffffffff]);
function hs_not64(x) {
    return I_xor(x, __i64_all_ones);
}
var hs_eqWord64 = I_equals;
var hs_neWord64 = I_notEquals;
var hs_ltWord64 = I_lessThan;
var hs_leWord64 = I_lessThanOrEqual;
var hs_gtWord64 = I_greaterThan;
var hs_geWord64 = I_greaterThanOrEqual;
var hs_quotWord64 = I_quot;
var hs_remWord64 = I_rem;
var __w64_max = I_fromBits([0,0,1]);
function hs_uncheckedShiftL64(x, bits) {
    return I_rem(I_shiftLeft(x, bits), __w64_max);
}
var hs_uncheckedShiftRL64 = I_shiftRight;
function hs_int64ToWord64(x) {
    var tmp = I_add(__w64_max, I_fromBits([x.getLowBits(), x.getHighBits()]));
    return I_rem(tmp, __w64_max);
}
function hs_word64ToInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

// Joseph Myers' MD5 implementation; used under the BSD license.

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

function md5blk(s) {
var md5blks = [], i;
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

// Functions for dealing with arrays.

function newArr(n, x) {
    var arr = [];
    for(; n >= 0; --n) {
        arr.push(x);
    }
    return arr;
}

// Create all views at once; perhaps it's wasteful, but it's better than having
// to check for the right view at each read or write.
function newByteArr(n) {
    // Pad the thing to multiples of 8.
    var padding = 8 - n % 8;
    if(padding < 8) {
        n += padding;
    }
    var arr = {};
    var buffer = new ArrayBuffer(n);
    var views = {};
    views['i8']  = new Int8Array(buffer);
    views['i16'] = new Int16Array(buffer);
    views['i32'] = new Int32Array(buffer);
    views['w8']  = new Uint8Array(buffer);
    views['w16'] = new Uint16Array(buffer);
    views['w32'] = new Uint32Array(buffer);
    views['f32'] = new Float32Array(buffer);
    views['f64'] = new Float64Array(buffer);
    arr['b'] = buffer;
    arr['v'] = views;
    // ByteArray and Addr are the same thing, so keep an offset if we get
    // casted.
    arr['off'] = 0;
    return arr;
}

// An attempt at emulating pointers enough for ByteString and Text to be
// usable without patching the hell out of them.
// The general idea is that Addr# is a byte array with an associated offset.

function plusAddr(addr, off) {
    var newaddr = {};
    newaddr['off'] = addr['off'] + off;
    newaddr['b']   = addr['b'];
    newaddr['v']   = addr['v'];
    return newaddr;
}

function writeOffAddr(type, elemsize, addr, off, x) {
    addr['v'][type][addr.off/elemsize + off] = x;
}

function readOffAddr(type, elemsize, addr, off) {
    return addr['v'][type][addr.off/elemsize + off];
}

// Two addresses are equal if they point to the same buffer and have the same
// offset. For other comparisons, just use the offsets - nobody in their right
// mind would check if one pointer is less than another, completely unrelated,
// pointer and then act on that information anyway.
function addrEq(a, b) {
    if(a == b) {
        return true;
    }
    return a && b && a['b'] == b['b'] && a['off'] == b['off'];
}

function addrLT(a, b) {
    if(a) {
        return b && a['off'] < b['off'];
    } else {
        return (b != 0); 
    }
}

function addrGT(a, b) {
    if(b) {
        return a && a['off'] > b['off'];
    } else {
        return (a != 0);
    }
}

function withChar(f, charCode) {
    return f(String.fromCharCode(charCode)).charCodeAt(0);
}

function u_towlower(charCode) {
    return withChar(function(c) {return c.toLowerCase()}, charCode);
}

function u_towupper(charCode) {
    return withChar(function(c) {return c.toUpperCase()}, charCode);
}

var u_towtitle = u_towupper;

function u_iswupper(charCode) {
    var c = String.fromCharCode(charCode);
    return c == c.toUpperCase() && c != c.toLowerCase();
}

function u_iswlower(charCode) {
    var c = String.fromCharCode(charCode);
    return  c == c.toLowerCase() && c != c.toUpperCase();
}

function u_iswdigit(charCode) {
    return charCode >= 48 && charCode <= 57;
}

function u_iswcntrl(charCode) {
    return charCode <= 0x1f || charCode == 0x7f;
}

function u_iswspace(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(/\s/g,'') != c;
}

function u_iswalpha(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(__hs_alphare, '') != c;
}

function u_iswalnum(charCode) {
    return u_iswdigit(charCode) || u_iswalpha(charCode);
}

function u_iswprint(charCode) {
    return !u_iswcntrl(charCode);
}

function u_gencat(c) {
    throw 'u_gencat is only supported with --full-unicode.';
}

// Regex that matches any alphabetic character in any language. Horrible thing.
var __hs_alphare = /[\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/g;

// 2D Canvas drawing primitives.
function jsHasCtx2D(elem) {return !!elem.getContext;}
function jsGetCtx2D(elem) {return elem.getContext('2d');}
function jsBeginPath(ctx) {ctx.beginPath();}
function jsMoveTo(ctx, x, y) {ctx.moveTo(x, y);}
function jsLineTo(ctx, x, y) {ctx.lineTo(x, y);}
function jsStroke(ctx) {ctx.stroke();}
function jsFill(ctx) {ctx.fill();}
function jsRotate(ctx, radians) {ctx.rotate(radians);}
function jsTranslate(ctx, x, y) {ctx.translate(x, y);}
function jsScale(ctx, x, y) {ctx.scale(x, y);}
function jsPushState(ctx) {ctx.save();}
function jsPopState(ctx) {ctx.restore();}
function jsResetCanvas(el) {el.width = el.width;}
function jsDrawImage(ctx, img, x, y) {ctx.drawImage(img, x, y);}
function jsDrawImageClipped(ctx, img, x, y, cx, cy, cw, ch) {
    ctx.drawImage(img, cx, cy, cw, ch, x, y, cw, ch);
}
function jsDrawText(ctx, str, x, y) {ctx.fillText(str, x, y);}
function jsClip(ctx) {ctx.clip();}
function jsArc(ctx, x, y, radius, fromAngle, toAngle) {
    ctx.arc(x, y, radius, fromAngle, toAngle);
}
function jsCanvasToDataURL(el) {return el.toDataURL('image/png');}

// Simulate handles.
// When implementing new handles, remember that passed strings may be thunks,
// and so need to be evaluated before use.

function jsNewHandle(init, read, write, flush, close, seek, tell) {
    var h = {
        read: read || function() {},
        write: write || function() {},
        seek: seek || function() {},
        tell: tell || function() {},
        close: close || function() {},
        flush: flush || function() {}
    };
    init.call(h);
    return h;
}

function jsReadHandle(h, len) {return h.read(len);}
function jsWriteHandle(h, str) {return h.write(str);}
function jsFlushHandle(h) {return h.flush();}
function jsCloseHandle(h) {return h.close();}

function jsMkConWriter(op) {
    return function(str) {
        str = E(str);
        var lines = (this.buf + str).split('\n');
        for(var i = 0; i < lines.length-1; ++i) {
            op.call(console, lines[i]);
        }
        this.buf = lines[lines.length-1];
    }
}

function jsMkStdout() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.log),
        function() {console.log(this.buf); this.buf = '';}
    );
}

function jsMkStderr() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.warn),
        function() {console.warn(this.buf); this.buf = '';}
    );
}

function jsMkStdin() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(len) {
            while(this.buf.length < len) {
                this.buf += prompt('[stdin]') + '\n';
            }
            var ret = this.buf.substr(0, len);
            this.buf = this.buf.substr(len);
            return ret;
        }
    );
}

var _0=function(_1,_2,_){var _3=A(_1,[_]);return A(_2,[_]);},_4=function(_5,_6,_){return _0(_5,_6,_);},_7=function(_8,_9,_){var _a=A(_8,[_]);return A(_9,[_a,_]);},_b=unCStr("GHC.IO.Exception"),_c=unCStr("base"),_d=unCStr("IOException"),_e=[0],_f=new T(function(){var _g=hs_wordToWord64(4053623282),_h=hs_wordToWord64(3693590983);return [0,_g,_h,[0,_g,_h,_c,_b,_d],_e];}),_i=function(_j){return E(_f);},_k=function(_l){return E(E(_l)[1]);},_m=unCStr("Maybe.fromJust: Nothing"),_n=new T(function(){return err(_m);}),_o=function(_p,_q,_r){var _s=new T(function(){var _t=A(_p,[_r]),_u=A(_q,[new T(function(){var _v=E(_s);return _v[0]==0?E(_n):E(_v[1]);})]),_w=hs_eqWord64(_t[1],_u[1]);if(!E(_w)){return [0];}else{var _x=hs_eqWord64(_t[2],_u[2]);return E(_x)==0?[0]:[1,_r];}});return E(_s);},_y=function(_z){var _A=E(_z);return _o(_k(_A[1]),_i,_A[2]);},_B=unCStr(": "),_C=[0,41],_D=unCStr(" ("),_E=function(_F,_G){var _H=E(_F);return _H[0]==0?E(_G):[1,_H[1],new T(function(){return _E(_H[2],_G);})];},_I=unCStr("already exists"),_J=unCStr("does not exist"),_K=unCStr("protocol error"),_L=unCStr("failed"),_M=unCStr("invalid argument"),_N=unCStr("inappropriate type"),_O=unCStr("hardware fault"),_P=unCStr("unsupported operation"),_Q=unCStr("timeout"),_R=unCStr("resource vanished"),_S=unCStr("interrupted"),_T=unCStr("resource busy"),_U=unCStr("resource exhausted"),_V=unCStr("end of file"),_W=unCStr("illegal operation"),_X=unCStr("permission denied"),_Y=unCStr("user error"),_Z=unCStr("unsatisified constraints"),_10=unCStr("system error"),_11=function(_12,_13){switch(E(_12)){case 0:return _E(_I,_13);case 1:return _E(_J,_13);case 2:return _E(_T,_13);case 3:return _E(_U,_13);case 4:return _E(_V,_13);case 5:return _E(_W,_13);case 6:return _E(_X,_13);case 7:return _E(_Y,_13);case 8:return _E(_Z,_13);case 9:return _E(_10,_13);case 10:return _E(_K,_13);case 11:return _E(_L,_13);case 12:return _E(_M,_13);case 13:return _E(_N,_13);case 14:return _E(_O,_13);case 15:return _E(_P,_13);case 16:return _E(_Q,_13);case 17:return _E(_R,_13);default:return _E(_S,_13);}},_14=[0,125],_15=unCStr("{handle: "),_16=function(_17,_18,_19,_1a,_1b,_1c){var _1d=new T(function(){var _1e=new T(function(){return _11(_18,new T(function(){var _1f=E(_1a);return _1f[0]==0?E(_1c):_E(_D,new T(function(){return _E(_1f,[1,_C,_1c]);}));}));}),_1g=E(_19);return _1g[0]==0?E(_1e):_E(_1g,new T(function(){return _E(_B,_1e);}));}),_1h=E(_1b);if(!_1h[0]){var _1i=E(_17);if(!_1i[0]){return E(_1d);}else{var _1j=E(_1i[1]);return _1j[0]==0?_E(_15,new T(function(){return _E(_1j[1],[1,_14,new T(function(){return _E(_B,_1d);})]);})):_E(_15,new T(function(){return _E(_1j[1],[1,_14,new T(function(){return _E(_B,_1d);})]);}));}}else{return _E(_1h[1],new T(function(){return _E(_B,_1d);}));}},_1k=function(_1l){var _1m=E(_1l);return _16(_1m[1],_1m[2],_1m[3],_1m[4],_1m[6],_e);},_1n=function(_1o,_1p){var _1q=E(_1o);return _16(_1q[1],_1q[2],_1q[3],_1q[4],_1q[6],_1p);},_1r=[0,44],_1s=[0,93],_1t=[0,91],_1u=function(_1v,_1w,_1x){var _1y=E(_1w);return _1y[0]==0?unAppCStr("[]",_1x):[1,_1t,new T(function(){return A(_1v,[_1y[1],new T(function(){var _1z=function(_1A){var _1B=E(_1A);return _1B[0]==0?E([1,_1s,_1x]):[1,_1r,new T(function(){return A(_1v,[_1B[1],new T(function(){return _1z(_1B[2]);})]);})];};return _1z(_1y[2]);})]);})];},_1C=function(_1D,_1E){return _1u(_1n,_1D,_1E);},_1F=function(_1G,_1H,_1I){var _1J=E(_1H);return _16(_1J[1],_1J[2],_1J[3],_1J[4],_1J[6],_1I);},_1K=[0,_1F,_1k,_1C],_1L=new T(function(){return [0,_i,_1K,_1M,_y];}),_1M=function(_1N){return [0,_1L,_1N];},_1O=[0],_1P=7,_1Q=function(_1R){return [0,_1O,_1P,_e,_1R,_1O,_1O];},_1S=function(_1T,_){return die(new T(function(){return _1M(new T(function(){return _1Q(_1T);}));}));},_1U=function(_1V,_){return _1S(_1V,_);},_1W=function(_1X,_){return _1X;},_1Y=[0,_7,_4,_1W,_1U],_1Z=function(_20,_21){return A(_20,[function(_){return jsFind(toJSStr(E(_21)));}]);},_22=function(_23,_24){while(1){var _25=E(_24);if(!_25[0]){return false;}else{if(!A(_23,[_25[1]])){_24=_25[2];continue;}else{return true;}}}},_26=function(_27){var _28=E(_27);return _28[0]==0?E(_n):E(_28[1]);},_29=function(_2a){return E(_2a)[0]==0?true:false;},_2b=function(_2c,_2d){var _2e=E(_2d);return _2e[0]==0?[0]:[1,new T(function(){return A(_2c,[_2e[1]]);}),new T(function(){return _2b(_2c,_2e[2]);})];},_2f=[0,34],_2g=function(_2h,_2i){while(1){var _2j=(function(_2k,_2l){var _2m=E(_2k);if(!_2m[0]){return [0];}else{var _2n=_2m[2],_2o=E(_2l);if(!_2o[0]){return [0];}else{var _2p=_2o[2];if(!E(_2o[1])[0]){return [1,_2m[1],new T(function(){return _2g(_2n,_2p);})];}else{_2h=_2n;_2i=_2p;return null;}}}})(_2h,_2i);if(_2j!=null){return _2j;}}},_2q=new T(function(){return unAppCStr("[]",_e);}),_2r=unCStr("Prelude.(!!): negative index\n"),_2s=new T(function(){return err(_2r);}),_2t=unCStr("Prelude.(!!): index too large\n"),_2u=new T(function(){return err(_2t);}),_2v=function(_2w,_2x){while(1){var _2y=E(_2w);if(!_2y[0]){return E(_2u);}else{var _2z=E(_2x);if(!_2z){return E(_2y[1]);}else{_2w=_2y[2];_2x=_2z-1|0;continue;}}}},_2A=unCStr("ACK"),_2B=unCStr("BEL"),_2C=unCStr("BS"),_2D=unCStr("SP"),_2E=[1,_2D,_e],_2F=unCStr("US"),_2G=[1,_2F,_2E],_2H=unCStr("RS"),_2I=[1,_2H,_2G],_2J=unCStr("GS"),_2K=[1,_2J,_2I],_2L=unCStr("FS"),_2M=[1,_2L,_2K],_2N=unCStr("ESC"),_2O=[1,_2N,_2M],_2P=unCStr("SUB"),_2Q=[1,_2P,_2O],_2R=unCStr("EM"),_2S=[1,_2R,_2Q],_2T=unCStr("CAN"),_2U=[1,_2T,_2S],_2V=unCStr("ETB"),_2W=[1,_2V,_2U],_2X=unCStr("SYN"),_2Y=[1,_2X,_2W],_2Z=unCStr("NAK"),_30=[1,_2Z,_2Y],_31=unCStr("DC4"),_32=[1,_31,_30],_33=unCStr("DC3"),_34=[1,_33,_32],_35=unCStr("DC2"),_36=[1,_35,_34],_37=unCStr("DC1"),_38=[1,_37,_36],_39=unCStr("DLE"),_3a=[1,_39,_38],_3b=unCStr("SI"),_3c=[1,_3b,_3a],_3d=unCStr("SO"),_3e=[1,_3d,_3c],_3f=unCStr("CR"),_3g=[1,_3f,_3e],_3h=unCStr("FF"),_3i=[1,_3h,_3g],_3j=unCStr("VT"),_3k=[1,_3j,_3i],_3l=unCStr("LF"),_3m=[1,_3l,_3k],_3n=unCStr("HT"),_3o=[1,_3n,_3m],_3p=[1,_2C,_3o],_3q=[1,_2B,_3p],_3r=[1,_2A,_3q],_3s=unCStr("ENQ"),_3t=[1,_3s,_3r],_3u=unCStr("EOT"),_3v=[1,_3u,_3t],_3w=unCStr("ETX"),_3x=[1,_3w,_3v],_3y=unCStr("STX"),_3z=[1,_3y,_3x],_3A=unCStr("SOH"),_3B=[1,_3A,_3z],_3C=unCStr("NUL"),_3D=[1,_3C,_3B],_3E=[0,92],_3F=unCStr("\\DEL"),_3G=unCStr("\\a"),_3H=unCStr("\\\\"),_3I=unCStr("\\SO"),_3J=unCStr("\\r"),_3K=unCStr("\\f"),_3L=unCStr("\\v"),_3M=unCStr("\\n"),_3N=unCStr("\\t"),_3O=unCStr("\\b"),_3P=function(_3Q,_3R){if(_3Q<=127){var _3S=E(_3Q);switch(_3S){case 92:return _E(_3H,_3R);case 127:return _E(_3F,_3R);default:if(_3S<32){var _3T=E(_3S);switch(_3T){case 7:return _E(_3G,_3R);case 8:return _E(_3O,_3R);case 9:return _E(_3N,_3R);case 10:return _E(_3M,_3R);case 11:return _E(_3L,_3R);case 12:return _E(_3K,_3R);case 13:return _E(_3J,_3R);case 14:return _E(_3I,new T(function(){var _3U=E(_3R);return _3U[0]==0?[0]:E(E(_3U[1])[1])==72?unAppCStr("\\&",_3U):E(_3U);}));default:return _E([1,_3E,new T(function(){var _3V=_3T;return _3V>=0?_2v(_3D,_3V):E(_2s);})],_3R);}}else{return [1,[0,_3S],_3R];}}}else{return [1,_3E,new T(function(){var _3W=jsShowI(_3Q);return _E(fromJSStr(_3W),new T(function(){var _3X=E(_3R);if(!_3X[0]){return [0];}else{var _3Y=E(_3X[1])[1];return _3Y<48?E(_3X):_3Y>57?E(_3X):unAppCStr("\\&",_3X);}}));})];}},_3Z=unCStr("\\\""),_40=function(_41,_42){var _43=E(_41);if(!_43[0]){return E(_42);}else{var _44=_43[2],_45=E(E(_43[1])[1]);return _45==34?_E(_3Z,new T(function(){return _40(_44,_42);})):_3P(_45,new T(function(){return _40(_44,_42);}));}},_46=[1,_1s,_e],_47=function(_48){var _49=E(_48);return _49[0]==0?E(_46):[1,_1r,[1,_2f,new T(function(){return _40(_49[1],[1,_2f,new T(function(){return _47(_49[2]);})]);})]];},_4a=function(_4b,_4c){return err(unAppCStr("Elements with the following IDs could not be found: ",new T(function(){var _4d=_2g(_4c,_4b);return _4d[0]==0?E(_2q):[1,_1t,[1,_2f,new T(function(){return _40(_4d[1],[1,_2f,new T(function(){return _47(_4d[2]);})]);})]];})));},_4e=function(_4f,_4g,_4h,_4i){var _4j=E(_4f),_4k=_4j[1],_4l=_4j[3];return A(_4k,[new T(function(){var _4m=new T(function(){return A(_4l,[_e]);}),_4n=function(_4o){var _4p=E(_4o);if(!_4p[0]){return E(_4m);}else{var _4q=new T(function(){return _4n(_4p[2]);});return A(_4k,[new T(function(){return _1Z(_4g,_4p[1]);}),function(_4r){return A(_4k,[_4q,function(_4s){return A(_4l,[[1,_4r,_4s]]);}]);}]);}};return _4n(_4h);}),function(_4t){return !_22(_29,_4t)?A(_4i,[new T(function(){return _2b(_26,_4t);})]):_4a(_4t,_4h);}]);},_4u=function(_4v){return E(_4v);},_4w=function(_4x,_4y){return E(_4x)[1]==E(_4y)[1];},_4z=function(_4A,_4B){return E(_4A)[1]!=E(_4B)[1];},_4C=[0,_4w,_4z],_4D=function(_4E){return E(E(_4E)[1]);},_4F=function(_4G,_4H,_4I){while(1){var _4J=E(_4H);if(!_4J[0]){return E(_4I)[0]==0?true:false;}else{var _4K=E(_4I);if(!_4K[0]){return false;}else{if(!A(_4D,[_4G,_4J[1],_4K[1]])){return false;}else{_4H=_4J[2];_4I=_4K[2];continue;}}}}},_4L=0,_4M=[0],_4N=[0,0],_4O=function(_4P,_4Q){while(1){var _4R=E(_4P);if(!_4R[0]){return E(_4Q);}else{_4P=_4R[2];var _4S=_4Q+1|0;_4Q=_4S;continue;}}},_4T=function(_4U,_4V){while(1){var _4W=(function(_4X,_4Y){var _4Z=E(_4Y);if(!_4Z[0]){return [0];}else{var _50=_4Z[1],_51=_4Z[2];if(!A(_4X,[_50])){var _52=_4X;_4V=_51;_4U=_52;return null;}else{return [1,_50,new T(function(){return _4T(_4X,_51);})];}}})(_4U,_4V);if(_4W!=null){return _4W;}}},_53=function(_54,_55){return E(_54)[1]>E(_55)[1];},_56=function(_57){var _58=E(_57);if(!_58[0]){return 0;}else{var _59=_58[2],_5a=E(_58[1]),_5b=function(_5c){return (_5c+_4O(_4T(function(_5d){return _53(_5a,_5d);},_59),0)|0)+_56(_59)|0;};if(E(_5a[1])==4){var _5e=_4O(_59,0);if(_5e<=0){if(_5e>=0){var _5f=quotRemI(_5e,2);return _5b(_5f[1]+_5f[2]|0);}else{var _5g=quotRemI(_5e+1|0,2);return _5b((_5g[1]-1|0)+((_5g[2]+2|0)-1|0)|0);}}else{if(_5e>=0){var _5h=quotRemI(_5e,2);return _5b(_5h[1]+_5h[2]|0);}else{var _5i=quotRemI(_5e+1|0,2);return _5b((_5i[1]-1|0)+((_5i[2]+2|0)-1|0)|0);}}}else{return _5b(0);}}},_5j=[0,_4N,_4N],_5k=[0,1],_5l=[0,_5k,_5k],_5m=unCStr("(Array.!): undefined array element"),_5n=new T(function(){return err(_5m);}),_5o=new T(function(){return [0,"(function(){return md51(jsRand().toString());})"];}),_5p=function(_5q){var _5r=A(_5q,[_]);return E(_5r);},_5s=function(_5t){return _5p(function(_){var _=0;return eval(E(_5t)[1]);});},_5u=function(_){return A(_5s,[_5o,_]);},_5v=function(_){return _5u(_);},_5w=function(_5x,_5y){if(_5x<=_5y){var _5z=function(_5A){return [1,[0,_5A],new T(function(){return _5A!=_5y?_5z(_5A+1|0):[0];})];};return _5z(_5x);}else{return [0];}},_5B=new T(function(){return _5w(1,4);}),_5C=unCStr("ArithException"),_5D=unCStr("GHC.Exception"),_5E=unCStr("base"),_5F=new T(function(){var _5G=hs_wordToWord64(4194982440),_5H=hs_wordToWord64(3110813675);return [0,_5G,_5H,[0,_5G,_5H,_5E,_5D,_5C],_e];}),_5I=function(_5J){return E(_5F);},_5K=function(_5L){var _5M=E(_5L);return _o(_k(_5M[1]),_5I,_5M[2]);},_5N=unCStr("arithmetic underflow"),_5O=unCStr("arithmetic overflow"),_5P=unCStr("Ratio has zero denominator"),_5Q=unCStr("denormal"),_5R=unCStr("divide by zero"),_5S=unCStr("loss of precision"),_5T=function(_5U){switch(E(_5U)){case 0:return E(_5O);case 1:return E(_5N);case 2:return E(_5S);case 3:return E(_5R);case 4:return E(_5Q);default:return E(_5P);}},_5V=function(_5W){return _E(_5N,_5W);},_5X=function(_5W){return _E(_5O,_5W);},_5Y=function(_5W){return _E(_5P,_5W);},_5Z=function(_5W){return _E(_5Q,_5W);},_60=function(_5W){return _E(_5R,_5W);},_61=function(_5W){return _E(_5S,_5W);},_62=function(_63){switch(E(_63)){case 0:return E(_5X);case 1:return E(_5V);case 2:return E(_61);case 3:return E(_60);case 4:return E(_5Z);default:return E(_5Y);}},_64=function(_65,_66){return _1u(_62,_65,_66);},_67=function(_68,_69){switch(E(_69)){case 0:return E(_5X);case 1:return E(_5V);case 2:return E(_61);case 3:return E(_60);case 4:return E(_5Z);default:return E(_5Y);}},_6a=[0,_67,_5T,_64],_6b=new T(function(){return [0,_5I,_6a,_6c,_5K];}),_6c=function(_5W){return [0,_6b,_5W];},_6d=3,_6e=function(_6f,_6g){return die(new T(function(){return A(_6g,[_6f]);}));},_6h=new T(function(){return _6e(_6d,_6c);}),_6i=function(_6j){var _6k=jsRound(_6j);return [0,_6k];},_6l=new T(function(){return [0,"(function(s){return s[0];})"];}),_6m=new T(function(){return _5s(_6l);}),_6n=function(_6o,_){var _6p=A(_6m,[E(_6o),_]);return new T(function(){return _6i(_6p);});},_6q=function(_6r,_){return _6n(_6r,_);},_6s=function(_6t,_6u){var _6v=_6t%_6u;if(_6t<=0){if(_6t>=0){return E(_6v);}else{if(_6u<=0){return E(_6v);}else{var _6w=E(_6v);return _6w==0?0:_6w+_6u|0;}}}else{if(_6u>=0){if(_6t>=0){return E(_6v);}else{if(_6u<=0){return E(_6v);}else{var _6x=E(_6v);return _6x==0?0:_6x+_6u|0;}}}else{var _6y=E(_6v);return _6y==0?0:_6y+_6u|0;}}},_6z=new T(function(){return [0,"(function(s){return md51(s.join(\',\'));})"];}),_6A=new T(function(){return _5s(_6z);}),_6B=function(_6C,_){return A(_6A,[E(_6C),_]);},_6D=function(_6r,_){return _6B(_6r,_);},_6E=function(_6F){return _5p(function(_){var _=0;return _6D(_6F,_);});},_6G=function(_6H,_6I,_6J){while(1){var _6K=(function(_6L,_6M,_6N){if(_6L>_6M){var _6O=_6M,_6P=_6L,_6Q=_6N;_6H=_6O;_6I=_6P;_6J=_6Q;return null;}else{return [0,new T(function(){var _6R=(_6M-_6L|0)+1|0;switch(_6R){case -1:return [0,_6L];case 0:return E(_6h);default:return [0,_6s(_5p(function(_){var _=0;return _6q(_6N,_);})[1],_6R)+_6L|0];}}),new T(function(){return _6E(_6N);})];}})(_6H,_6I,_6J);if(_6K!=null){return _6K;}}},_6S=function(_6T,_6U){var _6V=E(_6T);if(!_6V){return [0,_e,_6U];}else{var _6W=E(_6U);if(!_6W[0]){return [0,_e,_e];}else{var _6X=new T(function(){var _6Y=_6S(_6V-1|0,_6W[2]);return [0,_6Y[1],_6Y[2]];});return [0,[1,_6W[1],new T(function(){return E(E(_6X)[1]);})],new T(function(){return E(E(_6X)[2]);})];}}},_6Z=unCStr("Control.Exception.Base"),_70=unCStr("base"),_71=unCStr("PatternMatchFail"),_72=new T(function(){var _73=hs_wordToWord64(18445595),_74=hs_wordToWord64(52003073);return [0,_73,_74,[0,_73,_74,_70,_6Z,_71],_e];}),_75=function(_76){return E(_72);},_77=function(_78){var _79=E(_78);return _o(_k(_79[1]),_75,_79[2]);},_7a=function(_7b){return E(E(_7b)[1]);},_7c=function(_7d,_7e){return _E(E(_7d)[1],_7e);},_7f=function(_7g,_7h){return _1u(_7c,_7g,_7h);},_7i=function(_7j,_7k,_7l){return _E(E(_7k)[1],_7l);},_7m=[0,_7i,_7a,_7f],_7n=new T(function(){return [0,_75,_7m,_7o,_77];}),_7o=function(_7p){return [0,_7n,_7p];},_7q=unCStr("Irrefutable pattern failed for pattern"),_7r=function(_7s,_7t){var _7u=E(_7t);if(!_7u[0]){return [0,_e,_e];}else{var _7v=_7u[1];if(!A(_7s,[_7v])){return [0,_e,_7u];}else{var _7w=new T(function(){var _7x=_7r(_7s,_7u[2]);return [0,_7x[1],_7x[2]];});return [0,[1,_7v,new T(function(){return E(E(_7w)[1]);})],new T(function(){return E(E(_7w)[2]);})];}}},_7y=[0,32],_7z=[0,10],_7A=[1,_7z,_e],_7B=function(_7C){return E(E(_7C)[1])==124?false:true;},_7D=function(_7E,_7F){var _7G=_7r(_7B,unCStr(_7E)),_7H=_7G[1],_7I=function(_7J,_7K){return _E(_7J,new T(function(){return unAppCStr(": ",new T(function(){return _E(_7F,new T(function(){return _E(_7K,_7A);}));}));}));},_7L=E(_7G[2]);return _7L[0]==0?_7I(_7H,_e):E(E(_7L[1])[1])==124?_7I(_7H,[1,_7y,_7L[2]]):_7I(_7H,_e);},_7M=function(_7N){return _6e([0,new T(function(){return _7D(_7N,_7q);})],_7o);},_7O=new T(function(){return _7M("js.hs:22:24-47|(a, b : bs)");}),_7P=function(_7Q,_7R){var _7S=new T(function(){var _7T=_6G(0,_4O(_7Q,0)-1|0,_7R);return [0,_7T[1],_7T[2]];}),_7U=new T(function(){var _7V=E(E(_7S)[1])[1];if(_7V>=0){var _7W=_6S(_7V,_7Q),_7X=E(_7W[2]);return _7X[0]==0?E(_7O):[0,_7W[1],_7X[1],_7X[2]];}else{var _7Y=E(_7Q);return _7Y[0]==0?E(_7O):[0,_e,_7Y[1],_7Y[2]];}}),_7Z=new T(function(){var _80=E(_7U);return _7P(_E(_80[1],_80[3]),new T(function(){return E(E(_7S)[2]);}));}),_81=E(_7Q);return _81[0]==0?[1,new T(function(){return E(E(_7U)[2]);}),_7Z]:E(_81[2])[0]==0?[1,_81[1],_e]:[1,new T(function(){return E(E(_7U)[2]);}),_7Z];},_82=function(_83){var _84=A(_83,[_]);return E(_84);},_85=function(_){while(1){var _86=(function(_){var _87=_5v(_),_88=_7P(_5B,_87);return _56(_88)%2==0?new T(function(){return _82(function(_){var _89=newArr(4,_5n),_=(function(_8a,_8b,_){while(1){var _8c=E(_8a);if(_8c==4){return E(_);}else{var _8d=E(_8b);if(!_8d[0]){return E(_);}else{var _=_89[_8c]=_8d[1];_8a=_8c+1|0;_8b=_8d[2];continue;}}}})(0,_88,_),_8e=_89;return [0,E(_5j),E(_5l),4,_8e];});}):null;})(_);if(_86!=null){return _86;}}},_8f=unCStr("Pattern match failure in do expression at js.hs:35:3-13"),_8g=function(_8h,_){return _4L;},_8i=unCStr(": empty list"),_8j=unCStr("Prelude."),_8k=function(_8l){return err(_E(_8j,new T(function(){return _E(_8l,_8i);})));},_8m=unCStr("head"),_8n=new T(function(){return _8k(_8m);}),_8o=function(_8p,_8q){return _8p<=0?_8p>=0?quot(_8p,_8q):_8q<=0?quot(_8p,_8q):quot(_8p+1|0,_8q)-1|0:_8q>=0?_8p>=0?quot(_8p,_8q):_8q<=0?quot(_8p,_8q):quot(_8p+1|0,_8q)-1|0:quot(_8p-1|0,_8q)-1|0;},_8r=new T(function(){return [0,"keydown"];}),_8s=new T(function(){return [0,"mousedown"];}),_8t=unCStr("Error in array index"),_8u=new T(function(){return err(_8t);}),_8v=unCStr("Non-exhaustive patterns in"),_8w=function(_8x){return _6e([0,new T(function(){return _7D(_8x,_8v);})],_7o);},_8y=new T(function(){return _8w("js.hs:(34,39)-(66,9)|lambda");}),_8z=[0,4],_8A=function(_8B){var _8C=function(_8D){return [1,[0,[0,_8B],[0,_8D]],new T(function(){var _8E=E(_8D);return _8E==1?E(new T(function(){var _8F=E(_8B);return _8F==1?[0]:_8A(_8F+1|0);})):_8C(_8E+1|0);})];};return _8C(0);},_8G=new T(function(){return _8A(0);}),_8H=function(_8I){var _8J=function(_8K){return [1,[0,[0,_8I],[0,_8K]],new T(function(){var _8L=E(_8K);return _8L==1?E(new T(function(){var _8M=E(_8I);return _8M==1?[0]:_8H(_8M+1|0);})):_8J(_8L+1|0);})];};return _8J(0);},_8N=new T(function(){return _8H(0);}),_8O=[0,-1],_8P=unCStr("You win!"),_8Q=new T(function(){return _4F(_4C,_5B,_e);}),_8R=new T(function(){return [0,"strokeStyle"];}),_8S=new T(function(){return [0,"fillStyle"];}),_8T=[0,44],_8U=[1,_8T,_e],_8V=new T(function(){return [0,toJSStr(_8U)];}),_8W=[1,_8T,_e],_8X=new T(function(){return [0,toJSStr(_8W)];}),_8Y=new T(function(){return [0,"rgba("];}),_8Z=new T(function(){return [0,toJSStr(_e)];}),_90=[0,41],_91=[1,_90,_e],_92=new T(function(){return [0,toJSStr(_91)];}),_93=[1,_92,_e],_94=[1,_8T,_e],_95=new T(function(){return [0,toJSStr(_94)];}),_96=[1,_8T,_e],_97=new T(function(){return [0,toJSStr(_96)];}),_98=new T(function(){return [0,"rgb("];}),_99=[1,_90,_e],_9a=new T(function(){return [0,toJSStr(_99)];}),_9b=[1,_9a,_e],_9c=[1,_8T,_e],_9d=new T(function(){return [0,toJSStr(_9c)];}),_9e=function(_9f){var _9g=String(E(_9f)[1]);return [0,_9g];},_9h=function(_9i){var _9j=E(_9i);if(!_9j[0]){var _9k=jsCat([1,_98,[1,new T(function(){return _9e(_9j[1]);}),[1,_97,[1,new T(function(){return _9e(_9j[2]);}),[1,_95,[1,new T(function(){return _9e(_9j[3]);}),_93]]]]]],E(_8Z)[1]);return [0,_9k];}else{var _9l=jsCat([1,_8Y,[1,new T(function(){return _9e(_9j[1]);}),[1,_8X,[1,new T(function(){return _9e(_9j[2]);}),[1,_8V,[1,new T(function(){return _9e(_9j[3]);}),[1,_9d,[1,new T(function(){return _9e(_9j[4]);}),_9b]]]]]]]],E(_8Z)[1]);return [0,_9l];}},_9m=function(_9n,_9o){var _9p=new T(function(){return _9h(_9n);});return function(_9q,_){var _9r=E(_9q),_9s=_9r[1],_9t=E(_8S)[1],_9u=jsGet(_9s,_9t),_9v=E(_8R)[1],_9w=jsGet(_9s,_9v),_9x=E(_9p)[1],_9y=jsSet(_9s,_9t,_9x),_9z=jsSet(_9s,_9v,_9x),_9A=A(_9o,[_9r,_]),_9B=jsSet(_9s,_9t,_9u),_9C=jsSet(_9s,_9v,_9w);return _4L;};},_9D=function(_9E,_9F,_){var _9G=E(_9F),_9H=_9G[1],_9I=jsBeginPath(_9H),_9J=A(_9E,[_9G,_]),_9K=jsFill(_9H);return _4L;},_9L=function(_9M,_){return _4L;},_9N=function(_9O){var _9P=E(_9O);if(!_9P[0]){return E(_9L);}else{var _9Q=E(_9P[1]);return function(_9R,_){var _9S=E(_9R)[1],_9T=jsMoveTo(_9S,E(_9Q[1])[1],E(_9Q[2])[1]);return (function(_9U,_){while(1){var _9V=E(_9U);if(!_9V[0]){return _4L;}else{var _9W=E(_9V[1]),_9X=jsLineTo(_9S,E(_9W[1])[1],E(_9W[2])[1]);_9U=_9V[2];continue;}}})(_9P[2],_);};}},_9Y=function(_9Z,_a0,_a1){var _a2=new T(function(){var _a3=E(E(_a1)[1]);return _a3==4?E(_4N):[0,255-_8o(imul(225,_a3-1|0)|0,3)|0];});return _9m([0,_a2,_a2,_a2],function(_a4,_){return _9D(new T(function(){var _a5=new T(function(){return [0,E(_a0)[1]+64|0];}),_a6=new T(function(){return [0,E(_9Z)[1]+64|0];});return _9N([1,[0,_9Z,_a0],[1,[0,_a6,_a0],[1,[0,_a6,_a5],[1,[0,_9Z,_a5],[1,[0,_9Z,_a0],_e]]]]]);}),_a4,_);});},_a7=function(_a8,_){var _a9=E(_a8);if(!_a9[0]){return E(_8y);}else{var _aa=E(_a9[2]);if(!_aa[0]){return E(_8y);}else{if(!E(_aa[2])[0]){var _ab=E(_aa[1])[1],_ac=jsHasCtx2D(_ab);if(!E(_ac)){return _1U(_8f,_);}else{var _ad=jsGetCtx2D(_ab),_ae=[0,_ad],_af=newMVar(),_ag=function(_){var _ah=takeMVar(_af),_ai=E(_ah),_aj=jsResetCanvas(_ab),_ak=E(_ai[2]),_al=_ak[3],_am=_ak[4],_an=E(_ak[1]),_ao=_an[2],_ap=E(_ak[2]),_aq=_ap[2],_ar=E(_an[1])[1],_as=E(_ap[1])[1],_at=function(_){var _au=_al-1|0,_av=function(_){var _aw=jsAlert(toJSStr(E(_8P))),_ax=_85(_),_=putMVar(_af,[0,_4M,_ax]);return _ag(_);},_ay=function(_){var _az=E(_ai[1]);if(!_az[0]){var _=putMVar(_af,[0,_4M,_ak]);return _4L;}else{var _aA=_az[1],_aB=E(_az[2]),_aC=_aB[1],_aD=_aB[2],_aE=E(_az[3]),_aF=_aE[1],_aG=_aE[2],_aH=A(_9Y,[new T(function(){return [0,imul(64,E(_aG)[1])|0];}),new T(function(){return [0,imul(64,E(_aF)[1])|0];}),_8z,_ae,_]),_aI=A(_9Y,[new T(function(){var _aJ=E(_aG)[1];return [0,(imul(64,_aJ)|0)+_8o(imul(imul(64,E(_aD)[1]-_aJ|0)|0,E(_aA)[1])|0,8)|0];}),new T(function(){var _aK=E(_aF)[1];return [0,(imul(64,_aK)|0)+_8o(imul(imul(64,E(_aC)[1]-_aK|0)|0,E(_aA)[1])|0,8)|0];}),new T(function(){var _aL=E(_aF)[1];if(_ar>_aL){return E(_8u);}else{if(_aL>_as){return E(_8u);}else{var _aM=E(_ao)[1],_aN=E(_aq)[1],_aO=E(_aG)[1];return _aM>_aO?E(_8u):_aO>_aN?E(_8u):E(_am[(imul(_aL-_ar|0,(_aN-_aM|0)+1|0)|0)+(_aO-_aM|0)|0]);}}}),_ae,_]),_aP=E(E(_aA)[1]);if(_aP==7){var _=putMVar(_af,[0,_4M,new T(function(){return _82(function(_){var _aQ=newArr(_al,_5n),_=(function(_aR,_){while(1){if(_aR!=_al){var _=_aQ[_aR]=_am[_aR],_aS=_aR+1|0;_aR=_aS;continue;}else{return E(_);}}})(0,_),_aT=E(_aF)[1];if(_ar>_aT){return E(_8u);}else{if(_aT>_as){return E(_8u);}else{var _aU=E(_ao)[1],_aV=E(_aq)[1],_aW=E(_aG)[1];if(_aU>_aW){return E(_8u);}else{if(_aW>_aV){return E(_8u);}else{var _=_aQ[(imul(_aT-_ar|0,(_aV-_aU|0)+1|0)|0)+(_aW-_aU|0)|0]=new T(function(){var _aX=E(_aC)[1];if(_ar>_aX){return E(_8u);}else{if(_aX>_as){return E(_8u);}else{var _aY=E(_aD)[1];return _aU>_aY?E(_8u):_aY>_aV?E(_8u):E(_am[(imul(_aX-_ar|0,(_aV-_aU|0)+1|0)|0)+(_aY-_aU|0)|0]);}}}),_aZ=E(_aC)[1];if(_ar>_aZ){return E(_8u);}else{if(_aZ>_as){return E(_8u);}else{var _b0=E(_aD)[1];if(_aU>_b0){return E(_8u);}else{if(_b0>_aV){return E(_8u);}else{var _=_aQ[(imul(_aZ-_ar|0,(_aV-_aU|0)+1|0)|0)+(_b0-_aU|0)|0]=new T(function(){return E(_am[(imul(_aT-_ar|0,(_aV-_aU|0)+1|0)|0)+(_aW-_aU|0)|0]);}),_b1=_aQ;return [0,E(_an),E(_ap),_al,_b1];}}}}}}}}});})]);return _ag(_);}else{var _=putMVar(_af,[0,[1,[0,_aP+1|0],_aB,_aE],_ak]),_b2=jsSetTimeout(10,_ag);return _4L;}}};if(0<=_au){var _b3=function(_b4){return [1,new T(function(){return E(_am[_b4]);}),new T(function(){return _b4!=_au?_b3(_b4+1|0):[0];})];};return !_4F(_4C,_5B,_b3(0))?_ay(_):_av(_);}else{return !E(_8Q)?_ay(_):_av(_);}};if(_ar<=_as){var _b5=E(_ao)[1],_b6=E(_aq)[1],_b7=new T(function(){if(_ar!=_as){var _b8=function(_b9){var _ba=new T(function(){return _b9!=_as?_b8(_b9+1|0):E(_8g);});if(_b5<=_b6){var _bb=new T(function(){return _ar<=_b9;}),_bc=new T(function(){return _b9<=_as;}),_bd=function(_be){var _bf=new T(function(){return _9Y([0,imul(64,_be)|0],[0,imul(64,_b9)|0],new T(function(){return !E(_bb)?E(_8u):!E(_bc)?E(_8u):_b5>_be?E(_8u):_be>_b6?E(_8u):E(_am[(imul(_b9-_ar|0,(_b6-_b5|0)+1|0)|0)+(_be-_b5|0)|0]);}));}),_bg=new T(function(){return _be!=_b6?_bd(_be+1|0):E(_ba);});return function(_bh,_){var _bi=A(_bf,[_bh,_]);return A(_bg,[_bh,_]);};};return _bd(_b5);}else{return E(_ba);}};return _b8(_ar+1|0);}else{return E(_8g);}});if(_b5<=_b6){var _bj=new T(function(){return _ar<=_as;}),_bk=function(_bl){var _bm=new T(function(){return _9Y([0,imul(64,_bl)|0],[0,imul(64,_ar)|0],new T(function(){return !E(_bj)?E(_8u):_b5>_bl?E(_8u):_bl>_b6?E(_8u):E(_am[_bl-_b5|0]);}));}),_bn=new T(function(){return _bl!=_b6?_bk(_bl+1|0):E(_b7);});return function(_bo,_){var _bp=A(_bm,[_bo,_]);return A(_bn,[_bo,_]);};},_bq=A(_bk,[_b5,_ae,_]);return _at(_);}else{var _br=A(_b7,[_ae,_]);return _at(_);}}else{return _at(_);}},_bs=function(_bt,_bu,_bv,_bw,_bx,_by,_){if(0>_bw){var _=putMVar(_af,[0,_bt,_by]);return _4L;}else{if(_bw>1){var _=putMVar(_af,[0,_bt,_by]);return _4L;}else{var _bz=E(_bx),_bA=_bz[1];if(0>_bA){var _=putMVar(_af,[0,_bt,_by]);return _4L;}else{if(_bA>1){var _=putMVar(_af,[0,_bt,_by]);return _4L;}else{var _bB=E(_bv),_bC=_bA-_bB[1]|0,_bD=function(_bE){var _bF=E(_bu),_bG=_bw-_bF[1]|0;if(_bG<0){if((_bE+ -_bG|0)==1){var _=putMVar(_af,[0,[1,_4N,[0,_bF,_bB],[0,[0,_bw],_bz]],_by]);return E(_bt)[0]==0?_ag(_):_4L;}else{var _=putMVar(_af,[0,_bt,_by]);return _4L;}}else{if((_bE+_bG|0)==1){var _=putMVar(_af,[0,[1,_4N,[0,_bF,_bB],[0,[0,_bw],_bz]],_by]);return E(_bt)[0]==0?_ag(_):_4L;}else{var _=putMVar(_af,[0,_bt,_by]);return _4L;}}};return _bC<0?_bD( -_bC):_bD(_bC);}}}}},_bH=jsSetCB(_ab,E(_8s)[1],function(_bI,_bJ,_){var _bK=E(_bJ),_bL=takeMVar(_af),_bM=E(_bL),_bN=_bM[2],_bO=function(_bP,_bQ){return _bs(_bM[1],_bP,_bQ,_8o(E(_bK[2])[1],64),new T(function(){return [0,_8o(E(_bK[1])[1],64)];}),_bN,_);},_bR=E(_8G);if(!_bR[0]){return E(_8n);}else{var _bS=E(_bN),_bT=_bS[4],_bU=E(_bS[1]),_bV=E(_bS[2]),_bW=E(_bR[1]),_bX=E(_bU[1])[1],_bY=E(_bV[1])[1],_bZ=E(_bW[1]),_c0=_bZ[1];if(_bX>_c0){return E(_8u);}else{if(_c0>_bY){return E(_8u);}else{var _c1=E(_bU[2])[1],_c2=E(_bV[2])[1],_c3=E(_bW[2]),_c4=_c3[1];if(_c1>_c4){return E(_8u);}else{if(_c4>_c2){return E(_8u);}else{if(E(E(_bT[(imul(_c0-_bX|0,(_c2-_c1|0)+1|0)|0)+(_c4-_c1|0)|0])[1])==4){return _bO(_bZ,_c3);}else{var _c5=(function(_c6){while(1){var _c7=E(_c6);if(!_c7[0]){return E(_8n);}else{var _c8=E(_c7[1]),_c9=E(_c8[1]),_ca=_c9[1];if(_bX>_ca){return E(_8u);}else{if(_ca>_bY){return E(_8u);}else{var _cb=E(_c8[2]),_cc=_cb[1];if(_c1>_cc){return E(_8u);}else{if(_cc>_c2){return E(_8u);}else{if(E(E(_bT[(imul(_ca-_bX|0,(_c2-_c1|0)+1|0)|0)+(_cc-_c1|0)|0])[1])==4){return [0,_c9,_cb];}else{_c6=_c7[2];continue;}}}}}}}})(_bR[2]);return _bO(_c5[1],_c5[2]);}}}}}}}),_cd=jsSetCB(E(_a9[1])[1],E(_8r)[1],function(_ce,_){var _cf=takeMVar(_af),_cg=E(_cf),_ch=_cg[1],_ci=_cg[2],_cj=new T(function(){var _ck=E(_8N);if(!_ck[0]){return E(_8n);}else{var _cl=E(_ci),_cm=_cl[4],_cn=E(_cl[1]),_co=E(_cl[2]),_cp=E(_ck[1]),_cq=E(_cn[1])[1],_cr=E(_co[1])[1],_cs=E(_cp[1]),_ct=_cs[1];if(_cq>_ct){return E(_8u);}else{if(_ct>_cr){return E(_8u);}else{var _cu=E(_cn[2])[1],_cv=E(_co[2])[1],_cw=E(_cp[2]),_cx=_cw[1];if(_cu>_cx){return E(_8u);}else{if(_cx>_cv){return E(_8u);}else{if(E(E(_cm[(imul(_ct-_cq|0,(_cv-_cu|0)+1|0)|0)+(_cx-_cu|0)|0])[1])==4){return [0,_cs,_cw];}else{var _cy=(function(_cz){while(1){var _cA=E(_cz);if(!_cA[0]){return E(_8n);}else{var _cB=E(_cA[1]),_cC=E(_cB[1]),_cD=_cC[1];if(_cq>_cD){return E(_8u);}else{if(_cD>_cr){return E(_8u);}else{var _cE=E(_cB[2]),_cF=_cE[1];if(_cu>_cF){return E(_8u);}else{if(_cF>_cv){return E(_8u);}else{if(E(E(_cm[(imul(_cD-_cq|0,(_cv-_cu|0)+1|0)|0)+(_cF-_cu|0)|0])[1])==4){return [0,_cC,_cE];}else{_cz=_cA[2];continue;}}}}}}}})(_ck[2]);return [0,_cy[1],_cy[2]];}}}}}}}),_cG=new T(function(){return E(E(_cj)[2]);});switch(E(E(_ce)[1])){case 37:var _cH=E(E(_cj)[1]);return _bs(_ch,_cH,_cG,_cH[1],new T(function(){return [0,E(_cG)[1]+1|0];}),_ci,_);case 38:var _cI=E(E(_cj)[1]);return _bs(_ch,_cI,_cG,_cI[1]+1|0,_cG,_ci,_);case 39:var _cJ=E(E(_cj)[1]);return _bs(_ch,_cJ,_cG,_cJ[1],new T(function(){return [0,E(_cG)[1]-1|0];}),_ci,_);case 40:var _cK=E(E(_cj)[1]);return _bs(_ch,_cK,_cG,_cK[1]-1|0,_cG,_ci,_);default:return _bs(_ch,new T(function(){return E(E(_cj)[1]);}),_cG,-1,_8O,_ci,_);}}),_cL=_85(_),_=putMVar(_af,[0,_4M,_cL]);return _ag(_);}}else{return E(_8y);}}}},_cM=unCStr("canvas"),_cN=[1,_cM,_e],_cO=unCStr("body"),_cP=[1,_cO,_cN],_cQ=new T(function(){return _4e(_1Y,_4u,_cP,_a7);});
var hasteMain = function() {A(_cQ, [0]);};window.onload = hasteMain;