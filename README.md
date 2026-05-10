A basic JS arbitrary-precision library

Architecture considerations for future development:
| Type        |	Max value            |	Max safe n                        |
|-------------|----------------------|------------------------------------|
| Int32Array  | 2^31 − 1             | ~16K limbs	~256K bits              |
| Uint32Array |	2^32 − 1             | ~32K limbs	~512K bits              |
| Float64Array| 2^53 (safe int range)| ~2^36 limbs (effectively unlimited)|


| Bits | Decimal digits | Notable equivalent                          |
|------|----------------|---------------------------------------------|
| 16   | 4              |                                             |	
| 32	 | 9              | float32 has 24 significand bits → 7 digits  |
| 64   | 19             | float64 has 53 significand bits → 15 digits |
| 80	 | 24             | x87 extended precision                      |
| 112  | 33             | IEEE float128 (quad)                        |
| 128  | 38	            |                                             |
| 256  | 77	            |                                             |
| 320  | 96	            |                                             |
| 512  | 154	          |                                             |
| 1024 | 308	          |                                             |