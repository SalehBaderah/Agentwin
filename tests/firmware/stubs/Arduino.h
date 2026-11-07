#pragma once
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
using String = std::string;
extern unsigned long testMillis;
inline unsigned long millis() { return testMillis; }
