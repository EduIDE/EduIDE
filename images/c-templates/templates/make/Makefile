CC      ?= gcc
CFLAGS  ?= -std=c17 -Wall -Wextra -g
BIN_DIR := out

APP        := $(BIN_DIR)/app

.PHONY: all run build clean

all: build

build: $(APP)

$(APP): src/main.c | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $<

run: $(APP)
	./$(APP)


$(BIN_DIR):
	mkdir -p $(BIN_DIR)

clean:
	rm -rf $(BIN_DIR)
