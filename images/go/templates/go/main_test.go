package main

import "testing"

func TestGreet(t *testing.T) {
	want := "Hello, World!"
	if got := greet("World"); got != want {
		t.Errorf("greet(\"World\") = %q, want %q", got, want)
	}
}
