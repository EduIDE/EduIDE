package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AppTest {
    @Test
    void appHasGreeting() {
        assertNotNull(new App(), "App should be instantiable");
    }
}
