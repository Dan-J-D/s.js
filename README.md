# s.js
A tiny pure js binary serializer & type validator.
- Supports big & small endian systems
- Supports validating un-serializable types
- Supports serializable data types: integers, floats, booleans, utf8 Strings, arrays & objects

_Important Notice: When deserializing data, the output is not validated unlike serialization._


## Examples

### Typescript type to s.js type
```ts
interface user_signup {
    first_name: string;
    last_name?: string;
    age: number;
    account_type: 'personal' | 'business';
    referrals?: string[];
}

// to 

const user_signup = s.object({
    first_name: s.string().minlength(2),
    last_name: s.string().optional(),
    age: s.u8(),
    account_type: s.or(s.equal('personal'), s.equal('business')),
    referrals: s.array(s.string()).optional(),
});
```

### Validating data
```js
// err is of type Error[]
// data is validated data output or undefined if error
const [err, data] = user_signup.validate({
    first_name: 'dan',
    age: 18,
    account_type: 'personal',
});
```

### Serializing data
```js
const [
    err: Error[], 
    data: Uint8Array | undefined
] = user_signup.serialize({
    first_name: 'dan',
    age: 18,
    account_type: 'personal',
})
```

### Showing all functionality
```js
class klass {  };

const type = s.object({
    int_types: s.object({
        a: s.u8().default(1),
        b: s.u16().optional(),
        c: s.u32(),
        d: s.u64().min(10),
        e: s.i64().max(1000),
    }),
    float_types: s.object({
        a: s.f32().min(4.0),
        b: s.f64().max(10.2),
    }),
    arr: s.array(s.string().minlength(2).maxlength(10).inCharset('abcdef')),
    k: s.instanceOf(klass), // will not be serialized but can be validated
    d: s.or(s.u64(), s.equal('abc')), // can be different types
    b: s.boolean().default(false),
});
```
