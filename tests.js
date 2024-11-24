import { s } from './s.js';

console.log('If any `false` conditions are printed, the library is not working correctly.');

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
console.log(i64.serialize(BigInt('0x8000000000000000'))[0].length > 0);
console.log(string.deserialize(string.serialize('hello')[1])[1] === 'hello');
console.log(string.deserialize(string.serialize('✋ hello world')[1])[1] === '✋ hello world');

const arr = s.array(s.u8());

console.log(arr.validate([1])[1][0] === 1);
console.log(arr.validate([1, -1])[0].length > 0);

const or = s.or(s.u8(), s.i8());
console.log(or.deserialize(or.serialize(1)[1])[1] === 1);
console.log(or.deserialize(or.serialize(-10)[1])[1] === -10);

const arr2 = s.array(s.or(s.u8(), s.i8(), s.string().minlength(5)));
console.log(arr2.validate([1, -1])[1][0] === 1);
console.log(arr2.validate([1, -1])[1][1] === -1);
console.log(arr2.deserialize(arr2.serialize([1, -1])[1])[1][0] === 1);
console.log(arr2.deserialize(arr2.serialize([1, -1])[1])[1][1] === -1);
console.log(arr2.deserialize(arr2.serialize([1, -1, '🙋‍♂️ hi there'])[1])[1][2] === '🙋‍♂️ hi there');
console.log(string.deserialize(string.serialize(String.fromCharCode(0xfff3))[1])[1] === String.fromCharCode(0xfff3));

class a {
    constructor() {
        this.x = 1;
        this.y = 'hello';
    }
}

const aa = s.instanceOf(a);
console.log(aa.validate(new a())[1] instanceof a);
console.log(aa.isSerializable() === false);
console.log(aa.serialize(new a())[0].length > 0);

const eq = s.equal(1);
console.log(eq.validate(1)[1] === 1);
console.log(eq.validate(2)[0].length > 0);

const b = s.boolean();
console.log(b.validate(true)[1] === true);
console.log(b.validate(false)[1] === false);
console.log(b.validate(1)[0].length > 0);

const f32 = s.f32();
const f64 = s.f64();

console.log(f32.validate(1.5)[1] === 1.5);
console.log(f32.validate(1.5)[0].length === 0);
console.log(f64.validate(1.5)[1] === 1.5);
console.log(f64.validate(1.5)[0].length === 0);

let fraction = f32.deserialize(f32.serialize(1.6)[1])[1];
console.log(fraction >= (1.6 - 0.01) && fraction <= (1.6 + 0.01));

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

console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].x === 25);
console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].y === 'hello');
console.log(obj.validate({ x: 25, y: 'hello', z: 1 })[1].z === 1);
console.log(obj.deserialize(obj.serialize({
    x: 25, y: 'hello there', z: 1, a: [1, 5, 6], b: { c: 255 }
})[1])[1].b.c === 255);
console.log(obj.deserialize(obj.serialize({
    x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a()
})[1])[1].c === undefined);
console.log(obj.deserialize(obj.serialize({
    x: 25, y: 'hello there', z: 1, a: [1, 5, 6], c: new a(), d: 'test'
})[1])[1].d === undefined);
