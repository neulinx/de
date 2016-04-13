PKG_NAME = de
TARGET = /test/de
SOURCE = .

default: develop

depends:
	npm install

compile release: depends
	npm run $@

pack: release
	npm pack

develop: compile
	foxx-manager upgrade $(SOURCE) $(TARGET)

upgrade: release
	foxx-manager upgrade $(SOURCE) $(TARGET)

install: release
	foxx-manager install $(SOURCE) $(TARGET)

replace: release
	foxx-manager replace $(SOURCE) $(TARGET)

uninstall:
	foxx-manager uninstall $(TARGET)

clean:
	@rm lib/*.js

.PHONY: install upgrade replace uninstall release default depends compile clean pack
