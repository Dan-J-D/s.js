// network endianess is big endian (only supports 
// little & big endian on hosts) designed for api
// to be stable and no throwable errors, so no 
// need to check for errors

/**
 * @typedef serializableValidator
 * 
 * @property {() => numberValidator} u8
 * @property {() => numberValidator} u16
 * @property {() => numberValidator} u32
 * @property {() => numberValidator} u64
 * 
 * @property {() => numberValidator} i8
 * @property {() => numberValidator} i16
 * @property {() => numberValidator} i32
 * @property {() => numberValidator} i64
 * 
 * @property {() => floatValidator} f32
 * @property {() => floatValidator} f64
 * 
 * @property {() => stringValidator} string
 * @property {() => booleanValidator} boolean
 * @property {(x: any) => instanceOfValidator} instanceOf
 * @property {(x: any) => equalValidator} equal
 * 
 * @property {(type: baseValidator) => arrayValidator} array
 * @property {(...baseValidator) => orValidator} or
 * @property {(type: object) => objectValidator} object
 * 
 * @property {baseValidator} baseValidator
 * @property {baseSerializableValidator} baseSerializableValidator
 */
export const s = Object.freeze((() => {
	const utf8 = (function () {

		var stringFromCharCode = String.fromCharCode;

		// Taken from https://mths.be/punycode
		function ucs2decode(string) {
			var output = [];
			var counter = 0;
			var length = string.length;
			var value;
			var extra;
			while (counter < length) {
				value = string.charCodeAt(counter++);
				if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
					// high surrogate, and there is a next character
					extra = string.charCodeAt(counter++);
					if ((extra & 0xFC00) == 0xDC00) { // low surrogate
						output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
					} else {
						// unmatched surrogate; only append this code unit, in case the next
						// code unit is the high surrogate of a surrogate pair
						output.push(value);
						counter--;
					}
				} else {
					output.push(value);
				}
			}
			return output;
		}

		// Taken from https://mths.be/punycode
		function ucs2encode(array) {
			var length = array.length;
			var index = -1;
			var value;
			var output = '';
			while (++index < length) {
				value = array[index];
				if (value > 0xFFFF) {
					value -= 0x10000;
					output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
					value = 0xDC00 | value & 0x3FF;
				}
				output += stringFromCharCode(value);
			}
			return output;
		}

		function checkScalarValue(codePoint) {
			if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
				throw Error(
					'Lone surrogate U+' + codePoint.toString(16).toUpperCase() +
					' is not a scalar value'
				);
			}
		}
		/*--------------------------------------------------------------------------*/

		function createByte(codePoint, shift) {
			return stringFromCharCode(((codePoint >> shift) & 0x3F) | 0x80);
		}

		function encodeCodePoint(codePoint) {
			if ((codePoint & 0xFFFFFF80) == 0) { // 1-byte sequence
				return stringFromCharCode(codePoint);
			}
			var symbol = '';
			if ((codePoint & 0xFFFFF800) == 0) { // 2-byte sequence
				symbol = stringFromCharCode(((codePoint >> 6) & 0x1F) | 0xC0);
			}
			else if ((codePoint & 0xFFFF0000) == 0) { // 3-byte sequence
				checkScalarValue(codePoint);
				symbol = stringFromCharCode(((codePoint >> 12) & 0x0F) | 0xE0);
				symbol += createByte(codePoint, 6);
			}
			else if ((codePoint & 0xFFE00000) == 0) { // 4-byte sequence
				symbol = stringFromCharCode(((codePoint >> 18) & 0x07) | 0xF0);
				symbol += createByte(codePoint, 12);
				symbol += createByte(codePoint, 6);
			}
			symbol += stringFromCharCode((codePoint & 0x3F) | 0x80);
			return symbol;
		}

		function utf8encode(string) {
			var codePoints = ucs2decode(string);
			var length = codePoints.length;
			var index = -1;
			var codePoint;
			var byteString = '';
			while (++index < length) {
				codePoint = codePoints[index];
				byteString += encodeCodePoint(codePoint);
			}
			return byteString;
		}

		/*--------------------------------------------------------------------------*/

		function readContinuationByte() {
			if (byteIndex >= byteCount) {
				throw Error('Invalid byte index');
			}

			var continuationByte = byteArray[byteIndex] & 0xFF;
			byteIndex++;

			if ((continuationByte & 0xC0) == 0x80) {
				return continuationByte & 0x3F;
			}

			// If we end up here, it’s not a continuation byte
			throw Error('Invalid continuation byte');
		}

		function decodeSymbol() {
			var byte1;
			var byte2;
			var byte3;
			var byte4;
			var codePoint;

			if (byteIndex > byteCount) {
				throw Error('Invalid byte index');
			}

			if (byteIndex == byteCount) {
				return false;
			}

			// Read first byte
			byte1 = byteArray[byteIndex] & 0xFF;
			byteIndex++;

			// 1-byte sequence (no continuation bytes)
			if ((byte1 & 0x80) == 0) {
				return byte1;
			}

			// 2-byte sequence
			if ((byte1 & 0xE0) == 0xC0) {
				byte2 = readContinuationByte();
				codePoint = ((byte1 & 0x1F) << 6) | byte2;
				if (codePoint >= 0x80) {
					return codePoint;
				} else {
					throw Error('Invalid continuation byte');
				}
			}

			// 3-byte sequence (may include unpaired surrogates)
			if ((byte1 & 0xF0) == 0xE0) {
				byte2 = readContinuationByte();
				byte3 = readContinuationByte();
				codePoint = ((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3;
				if (codePoint >= 0x0800) {
					checkScalarValue(codePoint);
					return codePoint;
				} else {
					throw Error('Invalid continuation byte');
				}
			}

			// 4-byte sequence
			if ((byte1 & 0xF8) == 0xF0) {
				byte2 = readContinuationByte();
				byte3 = readContinuationByte();
				byte4 = readContinuationByte();
				codePoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0C) |
					(byte3 << 0x06) | byte4;
				if (codePoint >= 0x010000 && codePoint <= 0x10FFFF) {
					return codePoint;
				}
			}

			throw Error('Invalid UTF-8 detected');
		}

		var byteArray;
		var byteCount;
		var byteIndex;
		function utf8decode(byteString) {
			byteArray = ucs2decode(byteString);
			byteCount = byteArray.length;
			byteIndex = 0;
			var codePoints = [];
			var tmp;
			while ((tmp = decodeSymbol()) !== false) {
				codePoints.push(tmp);
			}
			return ucs2encode(codePoints);
		}

		return {
			encode: utf8encode,
			decode: utf8decode
		}
	})();

	const endianess = new Uint8Array(new Uint32Array([0x00010203]).buffer);

	/**
	 * @param {Uint8Array} x
	 * @returns {Uint8Array | undefined}
	 */
	const hton = (x) => {
		if (x instanceof Uint8Array === false)
			return undefined;

		if (endianess[0] === 0x00)
			x.reverse();
		return x;
	};

	/**
	 * @param {Uint8Array} x 
	 * @returns {Uint8Array | undefined}
	 */
	const ntoh = (x) => {
		if (x instanceof Uint8Array === false)
			return undefined;

		if (endianess[0] === 0x00)
			x.reverse();
		return x;
	}

	/**
	 * @param {number | BigInt} num 
	 * @param {number} bits 
	 * @returns {Uint8Array | undefined}
	 */
	const numToUint8Array = (num, bits) => {
		if (typeof num === 'number' &&
			!(bits === 8 || bits === 16 || bits === 32)
		)
			return undefined;

		if (typeof bits === 'bigint' &&
			!(bits === 64)
		)
			return undefined;

		const x = new Uint8Array(bits / 8);
		for (let i = 0; i < x.length; i++)
			x[i] = typeof num === 'bigint'
				? Number((num >> BigInt(bits - 8 * (i + 1))) & 0xffn)
				: (num >> bits - 8 * (i + 1)) & 0xff;
		return x;
	}

	/**
	 * @param {Uint8Array} x 
	 * @param {boolean} isSigned
	 * @returns {number | bigint | undefined}
	 */
	const uint8ArrayToNum = (x, isSigned) => {
		if (x instanceof Uint8Array === false)
			return undefined;

		let num = x.length >= 8 ? BigInt(0) : 0;
		for (let i = 0; i < x.length; i++)
			num |= x.length >= 8
				? BigInt(x[i]) << BigInt(8 * (x.length - i - 1))
				: x[i] << 8 * (x.length - i - 1);

		if (isSigned) {
			if (x.length === 8)
				num = (num & 0x8000000000000000n) === 0x8000000000000000n ? num - 0x10000000000000000n : num;
			else
				num = (num & (1 << (x.length * 8 - 1))) === (1 << (x.length * 8 - 1)) ? num - (1 << (x.length * 8)) : num;
		}
		return num;
	}

	/** @typedef {(value) => [Error[], unknown | undefined]} customValidator */

	/**
	 * @typedef baseValidator
	 * @property {(validator: customValidator) => this} addTypeValidator
	 * @property {(validator: customValidator) => this} addCustomValidator
	 * @property {(x: unknown) => [Error[], unknown | undefined]} checkValidators
	 * 
	 * @property {(v: unknown) => this} default
	 * @property {() => this} optional
	 * @property {(d: unknown) => [Error[], unknown | undefined]} validate
	 * @property {() => boolean} errors
	 * 
	 * @property {() => boolean} isSerializable
	 * @property {(d: unknown) => [Error[], Uint8Array | undefined]} serialize
	 * @property {(d: Uint8Array) => [Error[], unknown | undefined, number]} deserialize errors, value, bytes consumed
	 * 
	 * @property {Error[]} _errors
	 * @property {unknown} _default
	 * @property {boolean} _optional
	 * @property {customValidator[]} _typeValidators
	 * @property {customValidator[]} _customValidators
	 */
	class baseValidator {
		constructor() {
			/** @type {Error[]} */
			this._errors = [];

			/** @type {unknown} */
			this._default = undefined;

			/** @type {boolean} */
			this._optional = false;

			/** @type {customValidator[]} */
			this._typeValidators = [];

			/** @type {customValidator[]} */
			this._customValidators = [];
		}

		/**
		 * @param {customValidator} validator 
		 * @returns {this}
		 */
		addTypeValidator(validator) {
			if (typeof validator !== 'function')
				this._errors.push(new Error('type validator must be a function'));
			else
				this._typeValidators.push(validator);
			return this;
		}

		/**
		 * @param {customValidator} validator 
		 * @returns {this}
		 */
		addCustomValidator(validator) {
			if (typeof validator !== 'function')
				this._errors.push(new Error('custom validator must be a function'));
			else
				this._customValidators.push(validator);
			return this;
		}

		/**
		 * @param {unknown} x
		 * @returns {[Error[], unknown | undefined]}
		 */
		checkValidators(x) {
			for (const validator of this._typeValidators) {
				const [errors, value] = validator(x);
				if (errors && Array.isArray(errors) && errors.length > 0)
					return [errors, undefined];
				x = value;
			}

			for (const validator of this._customValidators) {
				const [errors, value] = validator(x);
				if (errors && Array.isArray(errors) && errors.length > 0)
					return [errors, undefined];
				x = value;
			}

			return [this._errors, x];
		}

		/**
		 * @param {unknown} v 
		 * @returns {this}
		 */
		default(v) {
			if (this._optional === true)
				this._errors.push(new Error('cannot set default value for optional field'));

			const [errors, values] = this.checkValidators(v);
			if (errors.length > 0)
				this._errors.push(new Error('default value does not pass validators'));

			this._default = values;
			return this;
		}

		/**
		 * @returns {this}
		 */
		optional() {
			if (this._default !== undefined)
				this._errors.push(new Error('cannot set optional for field with default value'));

			this._optional = true;
			return this;
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], unknown | undefined]}
		 */
		validate(d) {
			if (this._errors.length > 0)
				return [this._errors, undefined];

			if (d === undefined || d === null) {
				if (this._optional)
					return [this._errors, undefined];

				if (this._default !== undefined)
					return [this._errors, this._default];
			}

			const [errors, values] = this.checkValidators(d);
			if (errors.length === 0 && values === undefined && this._default !== undefined)
				return [this._errors, this._default];

			return [errors, values];
		}

		/**
		 * @returns {boolean}
		 */
		errors() {
			return this._errors;
		}

		/**
		 * @returns {boolean}
		 */
		isSerializable() { return false; }

		/**
		 * @param {unknown} d
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) { return [[new Error('value is not serializable')], undefined]; }

		/**
		 * @param {Uint8Array} d
		 * @returns {[Error[], unknown | undefined]}
		 */
		deserialize(d) {
			return [[new Error('value is not serializable')], undefined, 0];
		}
	}

	/**
	 * @typedef baseSerializableValidator
	 * @extends baseValidator
	 */
	class baseSerializableValidator extends baseValidator {
		constructor() {
			super();
		}

		/**
		 * @returns {boolean}
		 */
		isSerializable() { return true; }

		/**
		 * @param {unknown} d
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) { return [[], undefined] }

		/**
		 * @param {Uint8Array} d
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) { return [[], undefined, 0] }
	}

	const serializedTypeIds = {
		u8: 1,
		u16: 2,
		u32: 3,
		u64: 4,
		i8: 5,
		i16: 6,
		i32: 7,
		i64: 8,

		f32: 9,
		f64: 10,

		string_u8: 11,
		string_u16: 12,
		string_u32: 13,
		boolean_true: 14,
		boolean_false: 15,
		array_u8: 16,
		array_u16: 17,
		array_u32: 18,
		object: 19,

		optional_NULL: 20,
	}

	/**
	 * @typedef numberValidator
	 * @extends baseSerializableValidator
	 * 
	 * @property {number} _bits
	 * @property {boolean} _isSigned
	 * 
	 * @property {(x: number) => this} min
	 * @property {(x: number) => this} max
	 * @property {() => this} isWhole
	 */
	class numberValidator extends baseSerializableValidator {
		/**
		 * @param {number} bits 
		 * @param {boolean} isSigned 
		 * @param {number} typeId
		 */
		constructor(bits, isSigned) {
			super();

			if (typeof bits !== 'number' ||
				!(bits === 8 || bits === 16 || bits === 32 || bits === 64)
			)
				this._errors.push(new Error('numberValidator: bits must be 8, 16, 32, or 64'));
			else
				this._bits = bits;

			if (typeof isSigned !== 'boolean')
				this._errors.push(new Error('numberValidator: isSigned must be a boolean'));
			else
				this._isSigned = isSigned;

			this.addTypeValidator((v) => {
				if (typeof v === 'number' || typeof v === 'bigint')
					return [[], v];

				return [[new Error('numberValidator: value must be a number')], undefined];
			});

			this.addCustomValidator((v) => {
				if (typeof v === 'number') {
					if (isNaN(v))
						return [[new Error('numberValidator: value must be a number')], undefined];
					if (!isFinite(v))
						return [[new Error('numberValidator: value must be finite')], undefined];
				}

				return [[], v];
			});
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		min(x) {
			if (this._default !== undefined && this._default < x)
				this._errors.push(new Error('numberValidator.min: default value must be greater than ' + x));

			if ((typeof x !== 'number' || isNaN(x) || !isFinite(x)) && (typeof x !== 'bigint'))
				this._errors.push(new Error('numberValidator.min: x must be a finite number'));

			this.addCustomValidator((v) => {
				if (v < x)
					return [[new Error('numberValidator.min: value must be greater than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		max(x) {
			if (this._default !== undefined && this._default > x)
				this._errors.push(new Error('numberValidator.max: default value must be less than ' + x));

			if ((typeof x !== 'number' || isNaN(x) || !isFinite(x)) && (typeof x !== 'bigint'))
				this._errors.push(new Error('numberValidator.max: x must be a finite number'));

			this.addCustomValidator((v) => {
				if (v > x)
					return [[new Error('numberValidator.max: value must be less than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @returns {this}
		 */
		isWhole() {
			if (this._default !== undefined && !Number.isInteger(this._default))
				this._errors.push(new Error('numberValidator.isWhole: default value must be a whole number'));

			this.addCustomValidator((v) => {
				if (typeof v === 'number' && !Number.isInteger(v))
					return [[new Error('numberValidator.isWhole: value must be a whole number')], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], undefined];

			let x = numToUint8Array(value, this._bits);
			if (x === undefined)
				return [[new Error('failed turning num to Uint8Array')], undefined];

			x = hton(x);
			if (x === undefined)
				return [[new Error('failed converting to network endianess')], undefined];

			return [[], x];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing number')], undefined, 0];

			if (d.length < this._bits / 8)
				return [[new Error('failed deserializing number')], undefined, 0];

			let b = d.slice(0, this._bits / 8);
			b = ntoh(b);
			if (b === undefined)
				return [[new Error('failed converting from network endianess')], undefined, 0];

			const num = uint8ArrayToNum(b, this._isSigned);
			if (num === undefined)
				return [[new Error('failed converting from Uint8Array to number')], undefined, 0];

			return [[], num, this._bits / 8];
		}
	}

	/**
	 * @param {number} min 
	 * @param {number} max 
	 * @param {number} bits
	 * @param {boolean} isSigned
	 * @param {number} typeId
	 * @returns {numberValidator}
	 */
	const baseWholeNumber = (min, max, bits, isSigned, typeId) => {
		return new class extends numberValidator {
			constructor() {
				super(bits, isSigned, typeId);
				this.min(min).max(max).isWhole();
			}

			/**
			 * @param {unknown} d 
			 * @returns {[Error[], Uint8Array | undefined]}
			 */
			serialize(d) {
				const [errors, value] = super.serialize(d);
				if (errors.length > 0)
					return [errors, undefined];

				if (value === undefined)
					return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

				return [[], new Uint8Array([typeId, ...value])];
			}

			/**
			 * @param {Uint8Array} d
			 * @returns {[Error[], unknown | undefined, number]}
			 */
			deserialize(d) {
				if (d instanceof Uint8Array === false)
					return [[new Error('failed deserializing number')], undefined, 0];

				if (d.length < 1)
					return [[new Error('failed deserializing number')], undefined, 0];

				if (d[0] === serializedTypeIds.optional_NULL)
					return [[], undefined, 1];

				if (d[0] !== typeId)
					return [[new Error('failed deserializing number')], undefined, 0];

				d = d.slice(1);
				const [errors, value, bytes] = super.deserialize(d);
				if (errors.length > 0)
					return [errors, undefined, 0];

				return [[], value, bytes + 1];
			}
		}
	}

	const u8 = () => baseWholeNumber(0, 0xff, 8, false, serializedTypeIds.u8);
	const u16 = () => baseWholeNumber(0, 0xffff, 16, false, serializedTypeIds.u16);
	const u32 = () => baseWholeNumber(0, 0xffffffff, 32, false, serializedTypeIds.u32);
	const u64 = () => baseWholeNumber(BigInt(0), BigInt('0xffffffffffffffff'), 64, false, serializedTypeIds.u64);

	const i8 = () => baseWholeNumber(-0x80, 0x7f, 8, true, serializedTypeIds.i8);
	const i16 = () => baseWholeNumber(-0x8000, 0x7fff, 16, true, serializedTypeIds.i16);
	const i32 = () => baseWholeNumber(-0x80000000, 0x7fffffff, 32, true, serializedTypeIds.i32);
	const i64 = () => baseWholeNumber(BigInt('-9223372036854775808'), BigInt('0x7fffffffffffffff'), 64, true, serializedTypeIds.i64);

	class floatValidator extends baseSerializableValidator {
		constructor(bits) {
			super();

			if (typeof bits !== 'number' ||
				!(bits === 32 || bits === 64)
			)
				this._errors.push(new Error('floatValidator: bits must be 32 or 64'));
			else
				this._bits = bits;

			this.addTypeValidator((v) => {
				if (typeof v === 'number')
					return [[], v];

				return [[new Error('floatValidator: value must be a number')], undefined];
			});

			this.addCustomValidator((v) => {
				if (isNaN(v))
					return [[new Error('floatValidator: value must be a number')], undefined];
				if (!isFinite(v))
					return [[new Error('floatValidator: value must be finite')], undefined];

				return [[], v];
			});
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

			let x = new Uint8Array(this._bits === 32
				? (new Float32Array([value])).buffer
				: (new Float64Array([value])).buffer);
			x = hton(x);
			if (x === undefined)
				return [[new Error('failed converting to network endianess')], undefined];

			return [[], new Uint8Array([this._bits === 32
				? serializedTypeIds.f32 : serializedTypeIds.f64, ...x])];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing float')], undefined, 0];

			if (d.length < 1)
				return [[new Error('failed deserializing float')], undefined, 0];

			if (d[0] === serializedTypeIds.optional_NULL)
				return [[], undefined, 1];

			if (d[0] !== (this._bits === 32 ? serializedTypeIds.f32 : serializedTypeIds.f64))
				return [[new Error('failed deserializing float')], undefined, 0];

			if (d.length < this._bits / 8 + 1)
				return [[new Error('failed deserializing float')], undefined, 0];

			d = d.slice(1, this._bits / 8 + 1);
			d = ntoh(d);
			if (d === undefined)
				return [[new Error('failed converting from network endianess')], undefined, 0];

			const value = this._bits === 32
				? new Float32Array(d.buffer)[0]
				: new Float64Array(d.buffer)[0];

			return [[], value, this._bits / 8 + 1];
		}
	}

	const f32 = () => new floatValidator(32);
	const f64 = () => new floatValidator(64);

	/**
	 * @typedef stringValidator
	 * @extends baseSerializableValidator
	 * 
	 * @property {baseValidator} _type
	 * 
	 * @property {(x: number) => this} minlength
	 * @property {(x: number) => this} maxlength
	 * @property {(x: number) => this} length
	 * @property {(x: string) => this} inCharset
	 */
	class stringValidator extends baseSerializableValidator {
		constructor() {
			super();

			this.addTypeValidator((v) => {
				if (typeof v === 'string')
					return [[], v];

				return [[new Error('stringValidator: value must be a string')], undefined];
			});
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		minlength(x) {
			if (this._default !== undefined && this._default.length < x)
				this._errors.push(new Error('stringValidator.minlength: default value must be greater than ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('stringValidator.minlength: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length < x)
					return [[new Error('stringValidator.minlength: value must be greater than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		maxlength(x) {
			if (this._default !== undefined && this._default.length > x)
				this._errors.push(new Error('stringValidator.maxlength: default value must be less than ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('stringValidator.maxlength: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length > x)
					return [[new Error('stringValidator.maxlength: value must be less than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		length(x) {
			if (this._default !== undefined && this._default.length !== x)
				this._errors.push(new Error('stringValidator.length: default value must be of length ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('stringValidator.length: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length !== x)
					return [[new Error('stringValidator.length: value must be of length ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * 
		 * @param {string} x 
		 * @returns {this}
		 */
		inCharset(x) {
			if (this._default !== undefined && !x.includes(this._default))
				this._errors.push(new Error('stringValidator.inCharset: default value must be in charset'));

			if (typeof x !== 'string' || x.length === 0)
				this._errors.push(new Error('stringValidator.inCharset: x must be a string'));

			this.addCustomValidator((v) => {
				for (const c of v)
					if (!x.includes(c))
						return [[new Error('stringValidator.inCharset: value must be in charset')], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

			let x;
			try {
				x = utf8.encode(value);
				if (x === undefined)
					return [[new Error('failed encoding string')], undefined];
			} catch (e) {
				return [[new Error('failed encoding string')], undefined];
			}

			if (x.length < 0 || x.length > 0xffffffff)
				return [[new Error('stringValidator.serialize: string length must be between 0 and 0xffffffff')], undefined];

			let bits = x.length < 0xff ? 8 : x.length < 0xffff ? 16 : 32;
			let len = numToUint8Array(x.length, bits);
			if (len === undefined)
				return [[new Error('failed converting length to Uint8Array')], undefined];

			len = hton(len);
			if (len === undefined)
				return [[new Error('failed converting length to network endianess')], undefined];

			const y = new Uint8Array(1 + len.length + x.length);
			y[0] =
				bits === 8 ? serializedTypeIds.string_u8 :
					bits === 16 ? serializedTypeIds.string_u16 :
						serializedTypeIds.string_u32;
			len.forEach((v, i) => y[i + 1] = v);

			for (let i = 0; i < x.length; i++)
				y[i + 1 + len.length] = x.charCodeAt(i);
			return [[], y];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing string')], undefined, 0];

			if (d.length < 1)
				return [[new Error('failed deserializing string')], undefined, 0];

			if (d[0] === serializedTypeIds.optional_NULL)
				return [[], undefined, 1];

			let bits;
			switch (d[0]) {
				case serializedTypeIds.string_u8:
					bits = 8;
					break;
				case serializedTypeIds.string_u16:
					bits = 16;
					break;
				case serializedTypeIds.string_u32:
					bits = 32;
					break;
				default:
					return [[new Error('failed deserializing string')], undefined, 0];
			}

			d = d.slice(1);
			if (d.length < bits / 8)
				return [[new Error('failed deserializing string')], undefined, 0];

			let len = d.slice(0, bits / 8);
			len = ntoh(len);
			if (len === undefined)
				return [[new Error('failed converting length from network endianess')], undefined, 0];

			len = uint8ArrayToNum(len, false);
			if (len === undefined)
				return [[new Error('failed converting length from Uint8Array')], undefined, 0];

			d = d.slice(bits / 8, len + bits / 8);
			let x = String.fromCharCode(...d);
			try {
				x = utf8.decode(x);
				if (x === undefined)
					return [[new Error('failed decoding string')], undefined, 0];
			} catch (e) {
				return [[new Error('failed decoding string')], undefined, 0];
			}

			return [[], x, d.length + 1 + bits / 8];
		}
	}

	/**
	 * @returns {stringValidator}
	 */
	const string = () => new stringValidator();

	/**
	 * @typedef booleanValidator
	 * @extends baseSerializableValidator
	 */
	class booleanValidator extends baseSerializableValidator {
		constructor() {
			super();

			this.addTypeValidator((v) => {
				if (typeof v === 'boolean')
					return [[], v];

				return [[new Error('booleanValidator: value must be a boolean')], undefined];
			});
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

			return [[], new Uint8Array([value
				? serializedTypeIds.boolean_true
				: serializedTypeIds.boolean_false])];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing boolean')], undefined, 0];

			if (d.length < 1)
				return [[new Error('failed deserializing boolean')], undefined, 0];

			switch (d[0]) {
				case serializedTypeIds.optional_NULL:
					return [[], undefined, 1];
				case serializedTypeIds.boolean_true:
					return [[], true, 1];
				case serializedTypeIds.boolean_false:
					return [[], false, 1];
				default:
					return [[new Error('failed deserializing boolean')], undefined, 0];
			}
		}
	}

	/**
	 * @returns {booleanValidator}
	 */
	const boolean = () => new booleanValidator();

	/**
	 * @typedef instanceOfValidator
	 * @extends baseValidator
	 */
	class instanceOfValidator extends baseValidator {
		/**
		 * @param {class} type 
		 */
		constructor(type) {
			super();

			this.addTypeValidator((v) => {
				if (v instanceof type)
					return [[], v];
				return [[new Error('instanceofValidator: value must be an instance of type')], undefined];
			});
		}
	}

	/**
	 * @param {class} type
	 * @returns {instanceOfValidator}
	 */
	const instanceOf = (type) => new instanceOfValidator(type);

	/**
	 * @typedef equalValidator
	 * @extends baseValidator
	 */
	class equalValidator extends baseValidator {
		/**
		 * @param {unknown} value 
		 */
		constructor(value) {
			super();

			this.addTypeValidator((v) => {
				if (v === value)
					return [[], v];
				return [[new Error('equalValidator: value must be equal to ' + value)], undefined];
			});
		}
	}

	/**
	 * @param {unknown} value 
	 * @returns {equalValidator}
	 */
	const equal = (value) => new equalValidator(value);

	/**
		 * @typedef arrayValidator
		 * @extends baseSerializableValidator
		 * 
		 * @property {baseValidator} _type
		 * 
		 * @property {(x: number) => this} minlength
		 * @property {(x: number) => this} maxlength
		 * @property {(x: number) => this} length
		 */
	class arrayValidator extends baseSerializableValidator {
		/**
		 * @param {baseValidator} type 
		 */
		constructor(type) {
			super();

			this._type = type;
			if (typeof type !== 'object' || !type.validate)
				this._errors.push(new Error('arrayValidator: type must be of type baseValidator'));

			this.addTypeValidator((v) => {
				if (Array.isArray(v))
					return [[], v];
				return [[new Error('arrayValidator: value must be an array')], undefined];
			});

			this.addCustomValidator((v) => {
				for (var i = 0; i < v.length; i++) {
					const [errors, value] = type.validate(v[i]);
					if (errors.length > 0)
						return [errors, undefined];
					v[i] = value;
				}

				return [[], v];
			});
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		minlength(x) {
			if (this._default !== undefined && this._default.length < x)
				this._errors.push(new Error('arrayValidator.minlength: default value must be greater than ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('arrayValidator.minlength: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length < x)
					return [[new Error('arrayValidator.minlength: value must be greater than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		maxlength(x) {
			if (this._default !== undefined && this._default.length > x)
				this._errors.push(new Error('arrayValidator.maxlength: default value must be less than ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('arrayValidator.maxlength: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length > x)
					return [[new Error('arrayValidator.maxlength: value must be less than ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @param {number} x 
		 * @returns {this}
		 */
		length(x) {
			if (this._default !== undefined && this._default.length !== x)
				this._errors.push(new Error('arrayValidator.length: default value must be of length ' + x));

			if (typeof x !== 'number' || isNaN(x) || !isFinite(x) || !Number.isInteger(x) || x < 0)
				this._errors.push(new Error('arrayValidator.length: x must be a positive number'));

			this.addCustomValidator((v) => {
				if (v.length !== x)
					return [[new Error('arrayValidator.length: value must be of length ' + x)], undefined];
				return [[], v];
			});
			return this;
		}

		/**
		 * @returns {boolean}
		 */
		isSerializable() {
			if (this._type && this._type.isSerializable)
				return this._type.isSerializable();
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			if (!this.isSerializable()
				|| typeof this._type !== 'object'
				|| typeof this._type.serialize !== 'function')
				return [[new Error('arrayValidator: type is not serializable')], undefined];

			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

			let bits = value.length < 0xff ? 8 : value.length < 0xffff ? 16 : 32;
			let len = numToUint8Array(value.length, bits);
			if (len === undefined)
				return [[new Error('failed converting length to Uint8Array')], undefined];

			len = hton(len);
			if (len === undefined)
				return [[new Error('failed converting length to network endianess')], undefined];

			let x = new Uint8Array(1 + len.length);
			x[0] =
				bits === 8 ? serializedTypeIds.array_u8 :
					bits === 16 ? serializedTypeIds.array_u16 :
						serializedTypeIds.array_u32;
			len.forEach((v, i) => x[i + 1] = v);

			for (const v of value) {
				const [errors, y] = this._type.serialize(v);
				if (errors.length > 0)
					return [errors, undefined];
				x = new Uint8Array([...x, ...y]);
			}
			return [[], x];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (!this.isSerializable()
				|| typeof this._type !== 'object'
				|| typeof this._type.serialize !== 'function')
				return [[new Error('arrayValidator: type is not serializable')], undefined];

			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing array')], undefined, 0];

			if (d.length < 1)
				return [[new Error('failed deserializing array')], undefined, 0];

			if (d[0] === serializedTypeIds.optional_NULL)
				return [[], undefined, 1];

			let bits;
			switch (d[0]) {
				case serializedTypeIds.array_u8:
					bits = 8;
					break;
				case serializedTypeIds.array_u16:
					bits = 16;
					break;
				case serializedTypeIds.array_u32:
					bits = 32;
					break;
				default:
					return [[new Error('failed deserializing array')], undefined, 0];
			}

			d = d.slice(1);
			if (d.length < bits / 8)
				return [[new Error('failed deserializing array')], undefined, 0];

			let len = d.slice(0, bits / 8);
			len = ntoh(len);
			if (len === undefined)
				return [[new Error('failed converting length from network endianess')], undefined, 0];

			len = uint8ArrayToNum(len, false);
			if (len === undefined)
				return [[new Error('failed converting length from Uint8Array')], undefined, 0];

			d = d.slice(bits / 8);
			if (d.length < len)
				return [[new Error('failed deserializing array')], undefined, 0];

			let x = [];
			let b = 0;
			for (let i = 0; i < len; i++) {
				const [errors, value, bytes] = this._type.deserialize(d);
				if (errors.length > 0)
					return [errors, undefined, 0];
				x.push(value);
				b += bytes;
				d = d.slice(bytes);
			}

			return [[], x, 1 + bits / 8 + b];
		}
	}

	/**
	 * @param {baseValidator} type
	 * @returns {arrayValidator}
	 */
	const array = (type) => new arrayValidator(type);

	/**
	 * @typedef orValidator
	 * @extends baseSerializableValidator
	 * 
	 * @property {baseValidator[]} _types
	 * 
	 * @param  {...baseValidator} types
	 * @returns {orValidator}
	 */
	class orValidator extends baseSerializableValidator {
		/**
		 * @param  {...baseValidator} types 
		 */
		constructor(...types) {
			super();

			/** @type {baseValidator[]} */
			this._types = types;

			this.addTypeValidator((v) => {
				for (const type of types) {
					const [errors, value] = type.validate(v);
					if (errors.length === 0)
						return [[], value];
				}
				return [[new Error('orValidator: value must be of one of the types')], undefined];
			});
		}

		/**
		 * @returns {boolean}
		 */
		isSerializable() {
			for (const type of this._types)
				if (type && type.isSerializable && !type.isSerializable())
					return false;
			return true;
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, x] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			for (const type of this._types) {
				const [errors, y] = type.validate(x);
				if (errors.length === 0) {
					const [errors, value] = type.serialize(y);
					if (errors.length === 0)
						return [[], value];
				}
			}

			return [[new Error('failed serializing orValidator')], undefined];
		}

		/**
		 * @param {Uint8Array} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing orValidator')], undefined, 0];

			for (const type of this._types) {
				const [errors, value, bytes] = type.deserialize(d);
				if (errors.length === 0)
					return [[], value, bytes];
			}

			return [[new Error('failed deserializing orValidator')], undefined, 0];
		}
	}

	/**
	 * @param  {...baseValidator} types 
	 * @returns {orValidator}
	 */
	const or = (...types) => new orValidator(...types);

	/**
	 * @typedef objectValidator
	 * @extends baseSerializableValidator
	 * 
	 * @property {object} _type
	 */
	class objectValidator extends baseSerializableValidator {
		/**
		 * @param {object} type 
		 */
		constructor(type) {
			super();

			if (typeof type !== 'object')
				this._errors.push(new Error('objectValidator: type must be an object'));
			else
				/** @type {object} */
				this._type = type;

			this.addTypeValidator((v) => {
				if (typeof v === 'object')
					return [[], v];
				return [[new Error('objectValidator: value must be an object')], undefined];
			});

			this.addCustomValidator((v) => {
				for (const key in type) {
					if (typeof type[key] !== 'object'
						|| typeof type[key].validate !== 'function')
						return [[new Error('objectValidator: type must be of type baseValidator')], undefined];

					const [errors, value] = type[key].validate(v[key]);
					if (errors.length > 0)
						return [errors, undefined];
					v[key] = value;
				}
				return [[], v];
			});
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], Uint8Array | undefined]}
		 */
		serialize(d) {
			const [errors, value] = this.validate(d);
			if (errors.length > 0)
				return [errors, undefined];

			if (value === undefined)
				return [[], new Uint8Array([serializedTypeIds.optional_NULL])];

			let x = new Uint8Array(1);
			x[0] = serializedTypeIds.object;

			for (const key in value) {
				if (typeof this._type[key] !== 'object'
					|| typeof this._type[key].isSerializable !== 'function'
					|| typeof this._type[key].serialize !== 'function'
					|| !this._type[key].isSerializable())
					continue;

				const [errors, y] = this._type[key].serialize(value[key]);
				if (errors.length > 0)
					return [errors, undefined];
				x = new Uint8Array([...x, ...y]);
			}
			return [[], x];
		}

		/**
		 * @param {unknown} d 
		 * @returns {[Error[], unknown | undefined, number]}
		 */
		deserialize(d) {
			if (d instanceof Uint8Array === false)
				return [[new Error('failed deserializing object')], undefined, 0];

			if (d.length < 1)
				return [[new Error('failed deserializing object')], undefined, 0];

			if (d[0] === serializedTypeIds.optional_NULL)
				return [[], undefined, 1];

			if (d[0] !== serializedTypeIds.object)
				return [[new Error('failed deserializing object')], undefined, 0];

			d = d.slice(1);
			let x = {};
			let b = 0;
			for (const key in this._type) {
				if (typeof this._type[key] !== 'object'
					|| typeof this._type[key].isSerializable !== 'function'
					|| typeof this._type[key].deserialize !== 'function'
					|| !this._type[key].isSerializable())
					continue;

				if (d.length === 0)
					return [[new Error('failed deserializing object')], undefined, 0];

				const [errors, value, bytes] = this._type[key].deserialize(d);
				if (errors.length > 0)
					return [errors, undefined, 0];
				x[key] = value;
				b += bytes;
				d = d.slice(bytes);
			}

			return [[], x, 1 + b];
		}
	}

	/**
	 * @param {object} type
	 * @returns {objectValidator}
	 */
	const object = (type) => new objectValidator(type);

	return {
		u8,
		u16,
		u32,
		u64,

		i8,
		i16,
		i32,
		i64,

		f32,
		f64,

		string,
		boolean,
		instanceOf,
		equal,

		array,
		or,
		object,

		baseValidator,
		baseSerializableValidator
	}
})());

const i16 = s.i16();
const u64 = s.u64();
const i64 = s.i64();
const string = s.string();

console.log(s.u8().validate(-1)[0].length > 0);
console.log(i16.deserialize(i16.serialize(-6423)[1])[1] === -6423);
console.log(u64.deserialize(u64.serialize(0x123456789abcdef0n)[1])[1] === 0x123456789abcdef0n);
console.log(i64.deserialize(i64.serialize(0x123456789abcdef0n)[1])[1] === 0x123456789abcdef0n);
console.log(i64.deserialize(i64.serialize(BigInt('-9223372036854775808'))[1])[1] === -9223372036854775808n);
console.log(i64.deserialize(i64.serialize(BigInt('0x7fffffffffffffff'))[1])[1] === 0x7fffffffffffffffn);
console.log(i64.serialize(BigInt('0x8000000000000000'))[0].length > 0)
console.log(string.deserialize(string.serialize('hello')[1])[1] === 'hello');
console.log(string.deserialize(string.serialize('✋ hello world')[1])[1] === '✋ hello world');

const arr = s.array(s.u8());

console.log(arr.validate([1])[1][0] === 1)
console.log(arr.validate([1, -1])[0].length > 0)

const or = s.or(s.u8(), s.i8());
console.log(or.deserialize(or.serialize(1)[1])[1] === 1)
console.log(or.deserialize(or.serialize(-10)[1])[1] === -10)

const arr2 = s.array(s.or(s.u8(), s.i8(), s.string().minlength(5)));
console.log(arr2.validate([1, -1])[1][0] === 1)
console.log(arr2.validate([1, -1])[1][1] === -1)
console.log(arr2.deserialize(arr2.serialize([1, -1])[1])[1][0] === 1)
console.log(arr2.deserialize(arr2.serialize([1, -1])[1])[1][1] === -1)
console.log(arr2.deserialize(arr2.serialize([1, -1, '🙋‍♂️ hi there'])[1])[1][2] === '🙋‍♂️ hi there')
console.log(string.deserialize(string.serialize(String.fromCharCode(0xfff3))[1])[1] === String.fromCharCode(0xfff3))

class a {
	constructor() {
		this.x = 1;
		this.y = 'hello';
	}
}

const aa = s.instanceOf(a);
console.log(aa.validate(new a())[1] instanceof a)
console.log(aa.isSerializable() === false)
console.log(aa.serialize(new a())[0].length > 0)

const eq = s.equal(1);
console.log(eq.validate(1)[1] === 1)
console.log(eq.validate(2)[0].length > 0)

const b = s.boolean();
console.log(b.validate(true)[1] === true)
console.log(b.validate(false)[1] === false)
console.log(b.validate(1)[0].length > 0)

const f32 = s.f32();
const f64 = s.f64();

console.log(f32.validate(1.5)[1] === 1.5)
console.log(f32.validate(1.5)[0].length === 0)
console.log(f64.validate(1.5)[1] === 1.5)
console.log(f64.validate(1.5)[0].length === 0)

console.log(f32.deserialize(f32.serialize(1.6)[1])[1])

const obj = s.object({
	x: s.u8().min(25),
	y: s.string().minlength(5),
	z: s.or(s.u8(), s.i8()),
	a: s.array(s.u8()).optional(),
	b: s.object({
		c: s.u8()
	}).optional(),
	c: s.instanceOf(a).optional(),
	d: s.or(s.equal(1), s.equal('test')).default(1)
});

console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].x === 25)
console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].y === 'hello')
console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].z === 1)
console.log(obj.deserialize(obj.serialize({
	x: 25, y: 'hello there', z: 1, a: [1, 5, 6], b: { c: 255 }
})[1])[1].b.c === 255)
console.log(obj.deserialize(obj.serialize({
	x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a()
})[1])[1].c === undefined)
console.log(obj.deserialize(obj.serialize({
	x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a(), d: 'test'
})[1])[1].d === undefined)
console.log(obj.validate(obj.deserialize(obj.serialize({
	x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a()
})[1])[1]))
console.log(obj.serialize({
	x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a()
})[1])

let data = {
	"t": "Collector", "if": false, "mm": true, "ic": false,
	"wd": false, "hc": true, "hl": true, "hs": true, "ha": true,
	"u": "http://localhost/#", "r": "", "l": "en-US", "to": 240,
	"bl": "en-US;en", "bn": "Brave", "bv": "129.0.0.0", "bw": 589,
	"bh": 752, "bcd": 24, "bpd": 24, "en": "Blink", "ev": "129.0.0.0",
	"on": "Windows", "ov": "10", "dm": 8, "dt": "desktop", "da": "amd64",
	"db": 64, "dcc": 16, "do": "landscape-primary", "dg": "Google Inc. (NVIDIA)",
	"dr": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)",
	"msx": 0, "msy": 0, "dw": 589, "dh": 752, "tn": "browser-js",
	"tv": "1.0.0", "et": "wpv", "ts": "2024-10-10T18:05:34.610Z",
	"pts": "2024-10-10T18:05:34.371Z", "pid": "oK0A6k_48na50opmXGjdiLOjh7MQ.lDg",
	"aid": "test", "uid": "BtJg-zNUbz1wIbxH7W07rsZtesOXcbfW",
	"sid": "JEe+VmAXjQY6Rlh411fQKp4-Gn6tSoiP"
}

const dataValidator = s.object({
	t: s.string(),
	if: s.boolean(),
	mm: s.boolean(),
	wd: s.boolean(),
	hc: s.boolean(),
	hl: s.boolean(),
	hs: s.boolean(),
	ha: s.boolean(),
	u: s.string(),
	r: s.string(),
	l: s.string(),
	to: s.u32(),
	bl: s.string(),
	bn: s.string(),
	bv: s.string(),
	bw: s.u32(),
	bh: s.u32(),
	bcd: s.u32(),
	bpd: s.u32(),
	en: s.string(),
	ev: s.string(),
	on: s.string(),
	ov: s.string(),
	dm: s.u8(),
	dt: s.string(),
	da: s.string(),
	db: s.u8(),
	dcc: s.u8(),
	do: s.string(),
	dg: s.string(),
	dr: s.string(),
	msx: s.u32(),
	msy: s.u32(),
	dw: s.u32(),
	dh: s.u32(),
	tn: s.string(),
	tv: s.string(),
	et: s.string(),
	ts: s.string(),
	pts: s.string(),
	pid: s.string(),
	aid: s.string(),
	uid: s.string(),
	sid: s.string()
});

import fs from 'fs';
fs.writeFileSync('data.bin', dataValidator.serialize(data)[1]);
