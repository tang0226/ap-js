A basic JS arbitrary-precision library

Architecture considerations for future development:
| Type        |	Max value            |	Max safe n                        |
|-------------|----------------------|------------------------------------|
| Int32Array  | 2^31 − 1             | ~16K limbs	~256K bits              |
| Uint32Array |	2^32 − 1             | ~32K limbs	~512K bits              |
| Float64Array| 2^53 (safe int range)| ~2^36 limbs (effectively unlimited)|