package reasoning

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestBroadcastEventBuffersUntilWebSocketConnects(t *testing.T) {
	api := NewReasoningAPI(NewMockRouter(), nil)
	sid := "test-session-buffer"

	api.BroadcastEvent(ReasoningEvent{Type: EventDecomposeStart, SessionID: sid})
	api.BroadcastEvent(ReasoningEvent{Type: EventError, SessionID: sid, Payload: "early error"})

	srv := httptest.NewServer(http.HandlerFunc(api.HandleWebSocket))
	t.Cleanup(srv.Close)

	u := "ws" + strings.TrimPrefix(srv.URL, "http") + "/?session_id=" + sid
	c, _, err := websocket.DefaultDialer.Dial(u, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })

	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	for i := 0; i < 2; i++ {
		var got ReasoningEvent
		if err := c.ReadJSON(&got); err != nil {
			t.Fatalf("read %d: %v", i, err)
		}
		if got.SessionID != sid {
			t.Errorf("event %d: session_id = %q", i, got.SessionID)
		}
	}
}
