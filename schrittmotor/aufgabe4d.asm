; =====================================================================
;  Aufgabe 4d: Ventilatorsteuerung, Schrittmotor im Halbschrittbetrieb
;              Drehrichtung "Rechtslauf"
;
;  Zuordnungsliste:
;    Eingaenge:  S1 (Schadstoff zu hoch)  -> T1 -> PC.0  (gedrueckt = 1)
;                S2 (Wind Nord-Sued)      -> T2 -> PC.1  (gedrueckt = 1)
;    Ausgaenge:  Schrittmotor M1          -> PB.0 .. PB.3
;                LED-Rot  (Schadstoff)    -> PD.0
;                LED-Gruen (Rechtslauf)   -> PD.1
;
;  Funktion:  S1 = 1 und S2 = 1 -> Motor dreht rechts (Halbschritt)
;             sonst             -> Motor aus
;             LED-Rot zeigt S1, LED-Gruen zeigt S2
;  (S0 und S3 werden laut Aufgabe nicht beruecksichtigt)
;
;  Controller: ATmega8 (myAVR Board Light)
; =====================================================================

.def temp    = r18
.def counter = r19              ; ein gesetztes Bit = aktueller Schritt (1..8)
.def phase   = r20              ; Bitmuster fuer PB3..PB0
.def ledreg  = r21

.org 0x0000
        rjmp main

; ------------------------- Initialisierung ---------------------------
main:
        ldi temp, HIGH(RAMEND)  ; Stackpointer setzen (fuer rcall)
        out SPH, temp
        ldi temp, LOW(RAMEND)
        out SPL, temp

        ldi temp, 0b00000000
        out DDRC, temp          ; PortC = Eingang (Taster T1, T2)
        ldi temp, 0b00000011
        out PORTC, temp         ; Pull-up an PC.0 und PC.1

        ldi temp, 0b00001111
        out DDRB, temp          ; PB.0 .. PB.3 = Ausgang (Motor)
        ldi temp, 0b00000011
        out DDRD, temp          ; PD.0, PD.1 = Ausgang (LED-Rot, LED-Gruen)

        ldi phase, 0b00000000
        out PORTB, phase        ; Motor aus
        out PORTD, phase        ; LEDs aus

        ldi counter, 0b10000000 ; erstes lsl -> Schritt 1

; --------------------------- Hauptschleife ---------------------------
mainloop:
        ; ---- LEDs setzen ----
        ldi ledreg, 0b00000000
        sbis PINC, 0            ; S1 = 1 (Taster T1 gedrueckt, Pin = 0)?
        ori ledreg, 0b00000001  ; dann LED-Rot an
        sbis PINC, 1            ; S2 = 1 (Taster T2 gedrueckt, Pin = 0)?
        ori ledreg, 0b00000010  ; dann LED-Gruen an
        out PORTD, ledreg

        ; ---- Bedingung fuer Motor pruefen ----
        sbic PINC, 0            ; S1 = 1?
        rjmp motor_aus          ; nein -> Motor aus
        sbic PINC, 1            ; S2 = 1 (Nord-Sued-Wind)?
        rjmp motor_aus          ; nein -> Motor aus

        ; ---- Rechtslauf: naechster Halbschritt ----
        lsl counter             ; Schritt 1 -> 2 -> ... -> 8
        brne stepper            ; Counter nicht 0 -> Schritt ausgeben
        ldi counter, 0b00000001 ; nach Schritt 8 wieder Schritt 1

; ------------------ Halbschritt-Tabelle (Tabelle 1) ------------------
stepper:                        ;                PB3 PB2 PB1 PB0
        sbrc counter, 0
        ldi phase, 0b00000001   ; Schritt 1:      0   0   0   1
        sbrc counter, 1
        ldi phase, 0b00000101   ; Schritt 2:      0   1   0   1
        sbrc counter, 2
        ldi phase, 0b00000100   ; Schritt 3:      0   1   0   0
        sbrc counter, 3
        ldi phase, 0b00000110   ; Schritt 4:      0   1   1   0
        sbrc counter, 4
        ldi phase, 0b00000010   ; Schritt 5:      0   0   1   0
        sbrc counter, 5
        ldi phase, 0b00001010   ; Schritt 6:      1   0   1   0
        sbrc counter, 6
        ldi phase, 0b00001000   ; Schritt 7:      1   0   0   0
        sbrc counter, 7
        ldi phase, 0b00001001   ; Schritt 8:      1   0   0   1

        out PORTB, phase        ; Schritt an den Motor ausgeben
        rcall Wait2ms           ; Verzoegerung zwischen den Schritten
        rjmp mainloop

motor_aus:
        ldi phase, 0b00000000   ; alle Spulen aus
        out PORTB, phase
        rjmp mainloop

; ---------------------------------------------------------------------
;  Verzoegerung ca. 2 ms bei 1 MHz (Simulator)  10 * 50 * 4 = 2000 Takte
;  (laut Aufgabe als gegeben angenommen; auf dem myAVR Board mit
;   3,6864 MHz fuer ca. 2 ms "ldi r25, 37" verwenden)
; ---------------------------------------------------------------------
Wait2ms:
        push r24
        push r25
        ldi r25, 10
w_aussen:
        ldi r24, 50
w_innen:
        nop
        dec r24
        brne w_innen
        dec r25
        brne w_aussen
        pop r25
        pop r24
        ret
